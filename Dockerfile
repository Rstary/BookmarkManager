FROM python:3.9-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建实例目录
RUN mkdir -p instance

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["python", "app.py"] 