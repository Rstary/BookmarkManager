# 私人书签管理器

这是一个基于Flask的私人书签管理器，用于安全管理个人书签。

## Docker 一键部署

### 1. 克隆项目
```bash
git clone https://github.com/Rstary/BookmarkManager.git
cd BookmarkManager
```

### 2. 启动服务
```bash
# 构建并启动服务
docker-compose up -d

# 查看启动日志
docker-compose logs -f
```

### 3. 访问应用
访问 http://localhost:5000 即可使用。
首次访问时会自动进入注册页面，创建管理员账户。

## 数据存储

所有数据存储在两个SQLite数据库文件中：
- `instance/bookmarks.sqlite`：存储书签和分类数据
- `instance/auth.sqlite`：存储用户认证数据

数据存储在容器内的`/app/instance`目录，通过卷映射到宿主机的`./instance`目录。

### 密码重置
当忘记用户名或密码时，可以按以下步骤重置：
1. 停止服务：`docker-compose stop`
2. 删除认证数据库：`rm instance/auth.sqlite`
3. 重启服务：`docker-compose start`
4. 访问 http://localhost:5000 重新注册管理员账户 