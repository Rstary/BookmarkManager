# 私人书签管理器

这是一个基于Flask的私人书签管理器，用于安全管理个人书签。

## Docker 一键部署

```
git clone https://github.com/Rstary/BookmarkManager.git
cd BookmarkManager
```

```bash
docker-compose up -d
```

访问 http://your_server_ip:5000 即可使用。

## 数据存储

所有数据存储在两个SQLite数据库文件中：
- `instance/bookmarks.sqlite`：存储书签和分类数据
- `instance/auth.sqlite`：存储用户认证数据

数据存储在容器内的`/app/instance`目录，已经通过卷映射到宿主机的`./instance`目录。

### 密码重置

当忘记用户名或密码时，删除`instance/auth.sqlite`后，重新访问http://your_server_ip:5000即可 