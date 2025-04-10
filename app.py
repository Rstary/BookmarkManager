import os
import sqlite3
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
import time
from functools import wraps
import math
import re

app = Flask(__name__, instance_relative_config=True)
app.config.from_mapping(
    SECRET_KEY='dev',
    DATABASE=os.path.join(app.instance_path, 'bookmarks.sqlite'),
    AUTH_DATABASE=os.path.join(app.instance_path, 'auth.sqlite'),
    MAX_LOGIN_ATTEMPTS=5,
    LOGIN_TIMEOUT=300,  # 5分钟
    BLACKLIST_THRESHOLD=10,  # 10次失败尝试后加入黑名单
    BLACKLIST_DURATION=3600,  # 黑名单持续时间（秒）
)

# 确保实例文件夹存在
try:
    os.makedirs(app.instance_path)
except OSError:
    pass

# 数据库连接
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.db.row_factory = sqlite3.Row
    return g.db

def get_auth_db():
    if 'auth_db' not in g:
        g.auth_db = sqlite3.connect(
            app.config['AUTH_DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.auth_db.row_factory = sqlite3.Row
    return g.auth_db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()
    
    auth_db = g.pop('auth_db', None)
    if auth_db is not None:
        auth_db.close()

def init_db():
    db = get_db()
    
    # 创建书签数据表
    db.executescript('''
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER DEFAULT NULL,
        position INTEGER DEFAULT 0,
        FOREIGN KEY (parent_id) REFERENCES categories (id)
    );
    
    CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        category_id INTEGER NOT NULL,
        position INTEGER DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories (id)
    );
    ''')
    db.commit()
    
    # 创建认证数据表
    auth_db = get_auth_db()
    auth_db.executescript('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        successful BOOLEAN NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS ip_blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expiration INTEGER NOT NULL
    );
    ''')
    auth_db.commit()

# 初始化应用时自动创建数据库表
# Flask 2.0+ 不再支持 before_first_request
with app.app_context():
    init_db()

# 登录需求装饰器
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# 检查是否存在管理员账户
def has_admin():
    db = get_auth_db()
    try:
        user_count = db.execute('SELECT COUNT(id) FROM users').fetchone()[0]
        return user_count > 0
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库
        init_db()
        return False

# 检查IP是否在黑名单中
def is_ip_blacklisted(ip_address):
    db = get_auth_db()
    current_time = int(time.time())
    
    try:
        blacklisted = db.execute(
            'SELECT COUNT(*) FROM ip_blacklist WHERE ip_address = ? AND expiration > ?',
            (ip_address, current_time)
        ).fetchone()[0]
        return blacklisted > 0
    except sqlite3.OperationalError:
        # 如果表不存在，初始化数据库
        init_db()
        return False

# 将IP添加到黑名单
def blacklist_ip(ip_address):
    db = get_auth_db()
    current_time = int(time.time())
    expiration = current_time + app.config['BLACKLIST_DURATION']
    
    try:
        db.execute(
            'INSERT INTO ip_blacklist (ip_address, timestamp, expiration) VALUES (?, ?, ?)',
            (ip_address, current_time, expiration)
        )
        db.commit()
    except sqlite3.OperationalError:
        # 如果表不存在，初始化数据库
        init_db()
        db.execute(
            'INSERT INTO ip_blacklist (ip_address, timestamp, expiration) VALUES (?, ?, ?)',
            (ip_address, current_time, expiration)
        )
        db.commit()

# 防止暴力破解
def check_login_attempts(ip_address):
    if is_ip_blacklisted(ip_address):
        return False
        
    db = get_auth_db()
    current_time = int(time.time())
    timeout = current_time - app.config['LOGIN_TIMEOUT']
    
    # 获取指定时间内的登录尝试次数
    try:
        attempts = db.execute(
            'SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND timestamp > ? AND successful = 0',
            (ip_address, timeout)
        ).fetchone()[0]
        
        # 如果失败次数达到阈值，加入黑名单
        if attempts >= app.config['BLACKLIST_THRESHOLD']:
            blacklist_ip(ip_address)
            return False
            
        return attempts < app.config['MAX_LOGIN_ATTEMPTS']
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库
        init_db()
        return True

# 增加指数级延迟
def get_login_delay(ip_address):
    db = get_auth_db()
    current_time = int(time.time())
    timeout = current_time - app.config['LOGIN_TIMEOUT']
    
    try:
        attempts = db.execute(
            'SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND timestamp > ? AND successful = 0',
            (ip_address, timeout)
        ).fetchone()[0]
        
        if attempts > 0:
            # 指数级增长延迟: 2^(attempts-1) 秒，最多10秒
            return min(math.pow(2, attempts-1), 10)
        return 0
    except sqlite3.OperationalError:
        return 0

# 会话验证中间件
@app.before_request
def validate_session():
    if 'user_id' in session:
        # 排除不需要验证的路由
        if request.endpoint in ['login', 'register', 'logout', 'static']:
            return
            
        try:
            # 检查用户是否仍然存在
            db = get_auth_db()
            user = db.execute('SELECT id FROM users WHERE id = ?', (session['user_id'],)).fetchone()
            
            if user is None:
                # 用户不存在，清除会话
                session.clear()
                return redirect(url_for('login'))
        except sqlite3.OperationalError:
            # 数据库文件可能已被删除
            session.clear()
            return redirect(url_for('login'))

def record_login_attempt(ip_address, successful):
    db = get_auth_db()
    current_time = int(time.time())
    try:
        db.execute(
            'INSERT INTO login_attempts (ip_address, timestamp, successful) VALUES (?, ?, ?)',
            (ip_address, current_time, successful)
        )
        db.commit()
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库
        init_db()
        db.execute(
            'INSERT INTO login_attempts (ip_address, timestamp, successful) VALUES (?, ?, ?)',
            (ip_address, current_time, successful)
        )
        db.commit()

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login', methods=('GET', 'POST'))
def login():
    # 如果没有管理员账户，重定向到注册页面
    if not has_admin() and request.method == 'GET':
        return redirect(url_for('register'))
        
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        ip_address = request.remote_addr
        
        # 检查IP是否在黑名单中
        if is_ip_blacklisted(ip_address):
            flash('登录失败，请稍后再试')
            return render_template('login.html')
        
        # 检查登录尝试次数
        if not check_login_attempts(ip_address):
            flash('登录失败，请稍后再试')
            return render_template('login.html')
        
        # 应用延迟以减缓暴力破解
        delay = get_login_delay(ip_address)
        if delay > 0:
            time.sleep(delay)
        
        db = get_auth_db()
        user = db.execute(
            'SELECT * FROM users WHERE username = ?', (username,)
        ).fetchone()
        
        if user is not None and check_password_hash(user['password'], password):
            session.clear()
            session['user_id'] = user['id']
            session['login_time'] = int(time.time())
            record_login_attempt(ip_address, True)
            return redirect(url_for('index'))
        
        # 登录失败，不显示具体错误原因
        flash('登录失败，请检查您的用户名和密码')
        record_login_attempt(ip_address, False)
    
    return render_template('login.html')

# 验证密码强度
def validate_password(password):
    # 密码长度至少8位
    if len(password) < 8:
        return False, "密码长度必须至少为8位"
    
    # 包含大写字母
    if not re.search(r'[A-Z]', password):
        return False, "密码必须包含至少一个大写字母"
    
    # 包含小写字母
    if not re.search(r'[a-z]', password):
        return False, "密码必须包含至少一个小写字母"
    
    # 包含数字
    if not re.search(r'\d', password):
        return False, "密码必须包含至少一个数字"
    
    # 包含特殊字符
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "密码必须包含至少一个特殊字符"
    
    return True, ""

@app.route('/register', methods=('GET', 'POST'))
def register():
    # 只有在没有管理员账户的情况下才允许注册
    if has_admin():
        flash('已存在管理员账户，不允许注册')
        return redirect(url_for('login'))
        
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        db = get_auth_db()
        error = None
        
        if not username:
            error = '需要用户名'
        elif not password:
            error = '需要密码'
        else:
            # 验证密码强度
            is_valid, password_error = validate_password(password)
            if not is_valid:
                error = password_error
        
        if error is None:
            try:
                db.execute(
                    'INSERT INTO users (username, password) VALUES (?, ?)',
                    (username, generate_password_hash(password))
                )
                db.commit()
            except db.IntegrityError:
                error = f"用户 {username} 已经注册"
            else:
                # 初始化数据库
                init_db()
                return redirect(url_for('login'))
        
        flash(error)
    
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# API路由部分 - 分类相关
@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories():
    db = get_db()
    try:
        categories = db.execute(
            'SELECT id, name, parent_id, position FROM categories ORDER BY position'
        ).fetchall()
        
        result = []
        for category in categories:
            result.append({
                'id': category['id'],
                'name': category['name'],
                'parent_id': category['parent_id'],
                'position': category['position']
            })
        
        return jsonify(result)
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库并返回空列表
        init_db()
        return jsonify([])

@app.route('/api/categories', methods=['POST'])
@login_required
def create_category():
    data = request.json
    name = data.get('name')
    parent_id = data.get('parent_id')
    
    if not name:
        return jsonify({'error': '分类名称不能为空'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    try:
        # 获取最大位置值
        if parent_id:
            max_position = cursor.execute(
                'SELECT MAX(position) FROM categories WHERE parent_id = ?', 
                (parent_id,)
            ).fetchone()[0] or 0
        else:
            max_position = cursor.execute(
                'SELECT MAX(position) FROM categories WHERE parent_id IS NULL'
            ).fetchone()[0] or 0
        
        cursor.execute(
            'INSERT INTO categories (name, parent_id, position) VALUES (?, ?, ?)',
            (name, parent_id, max_position + 1)
        )
        db.commit()
        
        return jsonify({
            'id': cursor.lastrowid,
            'name': name,
            'parent_id': parent_id,
            'position': max_position + 1
        }), 201
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库
        init_db()
        # 再次尝试创建分类
        cursor = db.cursor()
        cursor.execute(
            'INSERT INTO categories (name, parent_id, position) VALUES (?, ?, ?)',
            (name, parent_id, 1)
        )
        db.commit()
        
        return jsonify({
            'id': cursor.lastrowid,
            'name': name,
            'parent_id': parent_id,
            'position': 1
        }), 201

@app.route('/api/categories/<int:category_id>', methods=['PUT'])
@login_required
def update_category(category_id):
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'error': '分类名称不能为空'}), 400
    
    db = get_db()
    db.execute(
        'UPDATE categories SET name = ? WHERE id = ?',
        (name, category_id)
    )
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
@login_required
def delete_category(category_id):
    db = get_db()
    try:
        # 先检查是否有子分类
        subcategories = db.execute(
            'SELECT id FROM categories WHERE parent_id = ?',
            (category_id,)
        ).fetchall()
        
        if subcategories:
            return jsonify({'message': '无法删除包含子分类的分类，请先删除所有子分类'}), 400
        
        # 删除分类下的所有书签
        db.execute('DELETE FROM bookmarks WHERE category_id = ?', (category_id,))
        
        # 删除分类
        db.execute('DELETE FROM categories WHERE id = ?', (category_id,))
        db.commit()
        
        return jsonify({'message': '分类删除成功'})
    except sqlite3.Error as e:
        db.rollback()
        return jsonify({'message': f'删除分类失败: {str(e)}'}), 500

@app.route('/api/categories/<int:category_id>/move', methods=['POST'])
@login_required
def move_category(category_id):
    db = get_db()
    try:
        data = request.get_json()
        parent_id = data.get('parent_id', None)
        
        # 检查分类是否存在
        category = db.execute(
            'SELECT id, parent_id FROM categories WHERE id = ?',
            (category_id,)
        ).fetchone()
        
        if not category:
            return jsonify({'message': '分类不存在'}), 404
        
        # 检查是否有子分类
        subcategories = db.execute(
            'SELECT id FROM categories WHERE parent_id = ?',
            (category_id,)
        ).fetchall()
        
        if subcategories:
            return jsonify({'message': '无法移动包含子分类的分类，请先移除所有子分类'}), 400
        
        # 如果指定了父分类，检查父分类是否存在
        if parent_id:
            parent_category = db.execute(
                'SELECT id, parent_id FROM categories WHERE id = ?',
                (parent_id,)
            ).fetchone()
            
            if not parent_category:
                return jsonify({'message': '父分类不存在'}), 404
            
            # 确保父分类是主分类，不能是子分类（防止三级嵌套）
            if parent_category['parent_id'] is not None:
                return jsonify({'message': '只能移动到主分类下，不能移动到子分类下'}), 400
            
            # 检查是否会导致循环引用
            current_parent_id = parent_id
            while current_parent_id:
                if int(current_parent_id) == category_id:
                    return jsonify({'message': '不能将分类移动到其子分类下'}), 400
                
                parent = db.execute(
                    'SELECT parent_id FROM categories WHERE id = ?',
                    (current_parent_id,)
                ).fetchone()
                
                if parent:
                    current_parent_id = parent['parent_id']
                else:
                    current_parent_id = None
        
        # 更新分类的父分类
        db.execute(
            'UPDATE categories SET parent_id = ? WHERE id = ?',
            (parent_id, category_id)
        )
        db.commit()
        
        return jsonify({'message': '分类移动成功'})
    except sqlite3.Error as e:
        db.rollback()
        return jsonify({'message': f'移动分类失败: {str(e)}'}), 500

@app.route('/api/categories/reorder', methods=['POST'])
@login_required
def reorder_categories():
    data = request.json
    categories = data.get('categories', [])
    
    db = get_db()
    for category in categories:
        db.execute(
            'UPDATE categories SET position = ?, parent_id = ? WHERE id = ?',
            (category['position'], category.get('parent_id'), category['id'])
        )
    
    db.commit()
    
    return jsonify({'success': True})

# API路由部分 - 书签相关
@app.route('/api/bookmarks', methods=['GET'])
@login_required
def get_bookmarks():
    category_id = request.args.get('category_id', type=int)
    
    db = get_db()
    try:
        if category_id:
            bookmarks = db.execute(
                'SELECT id, title, url, description, category_id, position FROM bookmarks WHERE category_id = ? ORDER BY position',
                (category_id,)
            ).fetchall()
        else:
            bookmarks = db.execute(
                'SELECT id, title, url, description, category_id, position FROM bookmarks ORDER BY position'
            ).fetchall()
        
        result = []
        for bookmark in bookmarks:
            result.append({
                'id': bookmark['id'],
                'title': bookmark['title'],
                'url': bookmark['url'],
                'description': bookmark['description'],
                'category_id': bookmark['category_id'],
                'position': bookmark['position']
            })
        
        return jsonify(result)
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库并返回空列表
        init_db()
        return jsonify([])

@app.route('/api/bookmarks', methods=['POST'])
@login_required
def create_bookmark():
    data = request.json
    title = data.get('title')
    url = data.get('url')
    description = data.get('description')
    category_id = data.get('category_id')
    
    if not title or not url or not category_id:
        return jsonify({'error': '标题、URL和分类不能为空'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    try:
        # 获取最大位置值
        max_position = cursor.execute(
            'SELECT MAX(position) FROM bookmarks WHERE category_id = ?', 
            (category_id,)
        ).fetchone()[0] or 0
        
        cursor.execute(
            'INSERT INTO bookmarks (title, url, description, category_id, position) VALUES (?, ?, ?, ?, ?)',
            (title, url, description, category_id, max_position + 1)
        )
        db.commit()
        
        return jsonify({
            'id': cursor.lastrowid,
            'title': title,
            'url': url,
            'description': description,
            'category_id': category_id,
            'position': max_position + 1
        }), 201
    except sqlite3.OperationalError:
        # 如果表不存在，自动初始化数据库
        init_db()
        # 再次尝试创建书签
        cursor = db.cursor()
        cursor.execute(
            'INSERT INTO bookmarks (title, url, description, category_id, position) VALUES (?, ?, ?, ?, ?)',
            (title, url, description, category_id, 1)
        )
        db.commit()
        
        return jsonify({
            'id': cursor.lastrowid,
            'title': title,
            'url': url,
            'description': description,
            'category_id': category_id,
            'position': 1
        }), 201

@app.route('/api/bookmarks/<int:bookmark_id>', methods=['PUT'])
@login_required
def update_bookmark(bookmark_id):
    data = request.json
    title = data.get('title')
    url = data.get('url')
    description = data.get('description')
    category_id = data.get('category_id')
    
    if not title or not url or not category_id:
        return jsonify({'error': '标题、URL和分类不能为空'}), 400
    
    db = get_db()
    db.execute(
        'UPDATE bookmarks SET title = ?, url = ?, description = ?, category_id = ? WHERE id = ?',
        (title, url, description, category_id, bookmark_id)
    )
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/bookmarks/<int:bookmark_id>', methods=['DELETE'])
@login_required
def delete_bookmark(bookmark_id):
    try:
        db = get_db()
        
        # 首先检查书签是否存在
        bookmark = db.execute('SELECT id FROM bookmarks WHERE id = ?', (bookmark_id,)).fetchone()
        if bookmark is None:
            return jsonify({'error': '书签不存在'}), 404
            
        # 执行删除操作
        db.execute('DELETE FROM bookmarks WHERE id = ?', (bookmark_id,))
        db.commit()
        
        return jsonify({'success': True})
    except sqlite3.Error as e:
        # 数据库错误处理
        print(f"删除书签时出错: {str(e)}")
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    except Exception as e:
        # 其他异常处理
        print(f"删除书签时出现未知错误: {str(e)}")
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/bookmarks/reorder', methods=['POST'])
@login_required
def reorder_bookmarks():
    data = request.json
    bookmarks = data.get('bookmarks', [])
    
    db = get_db()
    for bookmark in bookmarks:
        db.execute(
            'UPDATE bookmarks SET position = ?, category_id = ? WHERE id = ?',
            (bookmark['position'], bookmark['category_id'], bookmark['id'])
        )
    
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/bookmarks/move', methods=['POST'])
@login_required
def move_bookmarks():
    data = request.json
    bookmark_ids = data.get('bookmark_ids', [])
    target_category_id = data.get('target_category_id')
    
    if not bookmark_ids or not target_category_id:
        return jsonify({'error': '书签ID和目标分类ID不能为空'}), 400
    
    db = get_db()
    
    # 获取目标分类中最大的位置值
    max_position = db.execute(
        'SELECT MAX(position) FROM bookmarks WHERE category_id = ?', 
        (target_category_id,)
    ).fetchone()[0] or 0
    
    # 更新书签的分类和位置
    for i, bookmark_id in enumerate(bookmark_ids):
        db.execute(
            'UPDATE bookmarks SET category_id = ?, position = ? WHERE id = ?',
            (target_category_id, max_position + i + 1, bookmark_id)
        )
    
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/bookmarks/<int:id>/position', methods=['PUT'])
@login_required
def update_bookmark_position(id):
    data = request.json
    position = data.get('position')
    category_id = data.get('category_id')
    
    print(f"更新书签位置: id={id}, 新位置={position}, 分类={category_id}")
    
    if position is None or category_id is None:
        return jsonify({'error': '位置和分类ID不能为空'}), 400
    
    position = int(position)
    category_id = int(category_id)
    
    db = get_db()
    
    # 开始显式事务
    db.execute('BEGIN TRANSACTION')
    
    try:
        cursor = db.cursor()
        
        # 获取当前书签信息
        bookmark = cursor.execute(
            'SELECT id, title, category_id, position FROM bookmarks WHERE id = ?',
            (id,)
        ).fetchone()
        
        if not bookmark:
            db.rollback()
            return jsonify({'error': '书签不存在'}), 404
        
        old_position = int(bookmark['position'])
        old_category_id = int(bookmark['category_id'])
        bookmark_title = bookmark['title']
        
        print(f"书签「{bookmark_title}」原位置: position={old_position}, category_id={old_category_id}")
        
        # 如果是同一分类内移动
        if old_category_id == category_id:
            if old_position < position:
                # 向后移动，将中间的书签向前移
                print(f"向后移动: {old_position} -> {position}")
                cursor.execute(
                    'UPDATE bookmarks SET position = position - 1 WHERE category_id = ? AND position > ? AND position <= ?',
                    (category_id, old_position, position)
                )
            elif old_position > position:
                # 向前移动，将中间的书签向后移
                print(f"向前移动: {old_position} -> {position}")
                cursor.execute(
                    'UPDATE bookmarks SET position = position + 1 WHERE category_id = ? AND position >= ? AND position < ?',
                    (category_id, position, old_position)
                )
        else:
            # 跨分类移动
            print(f"跨分类移动: {old_category_id} -> {category_id}")
            # 1. 原分类中的后续书签向前移
            cursor.execute(
                'UPDATE bookmarks SET position = position - 1 WHERE category_id = ? AND position > ?',
                (old_category_id, old_position)
            )
            
            # 2. 目标分类中的书签为新书签腾出位置
            cursor.execute(
                'UPDATE bookmarks SET position = position + 1 WHERE category_id = ? AND position >= ?',
                (category_id, position)
            )
        
        # 更新书签位置
        cursor.execute(
            'UPDATE bookmarks SET position = ?, category_id = ? WHERE id = ?',
            (position, category_id, id)
        )
        
        # 规范化位置值，确保连续
        print(f"规范化分类 {category_id} 的书签位置")
        cursor.execute('''
            UPDATE bookmarks SET position = (
                SELECT COUNT(*) 
                FROM bookmarks AS b 
                WHERE b.category_id = bookmarks.category_id AND b.position <= bookmarks.position
            )
            WHERE category_id = ?
        ''', (category_id,))
        
        # 如果是跨分类移动，还需要规范化原分类
        if old_category_id != category_id:
            print(f"规范化原分类 {old_category_id} 的书签位置")
            cursor.execute('''
                UPDATE bookmarks SET position = (
                    SELECT COUNT(*) 
                    FROM bookmarks AS b 
                    WHERE b.category_id = bookmarks.category_id AND b.position <= bookmarks.position
                )
                WHERE category_id = ?
            ''', (old_category_id,))
        
        # 提交事务
        db.commit()
        
        # 获取更新后的真实位置（可能在规范化后有变化）
        updated_bookmark = cursor.execute(
            'SELECT id, title, url, description, category_id, position FROM bookmarks WHERE id = ?',
            (id,)
        ).fetchone()
        
        # 获取分类内所有书签的最新位置信息，用于前端完整更新
        category_bookmarks = cursor.execute(
            'SELECT id, title, position FROM bookmarks WHERE category_id = ? ORDER BY position',
            (category_id,)
        ).fetchall()
        
        category_bookmarks_list = []
        for b in category_bookmarks:
            category_bookmarks_list.append({
                'id': b['id'],
                'title': b['title'],
                'position': b['position']
            })
        
        print(f"书签位置更新成功: id={id}, 规范化后位置={updated_bookmark['position']}, 分类={category_id}")
        print(f"分类 {category_id} 中所有书签位置: {', '.join([f'{b['title']}:{b['position']}' for b in category_bookmarks_list])}")
        
        # 转换为字典
        if updated_bookmark:
            result = {
                'id': updated_bookmark['id'],
                'title': updated_bookmark['title'],
                'url': updated_bookmark['url'],
                'description': updated_bookmark['description'],
                'category_id': updated_bookmark['category_id'],
                'position': updated_bookmark['position'],
                'category_bookmarks': category_bookmarks_list,
                'success': True
            }
        else:
            result = {'success': True}
            
        return jsonify(result)
        
    except sqlite3.Error as e:
        db.rollback()
        print(f"更新书签位置错误: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False) 