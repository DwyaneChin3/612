# 部署指南：腾讯云 CVM + COS 部署 B612 记忆站

整体架构：

```
浏览器 ──► Nginx (80) ──► 静态文件 index.html、assets/
                    └──► /api/* 反向代理到 Node.js (3000)
                                          └──► SQLite (CVM 本地)
                                          └──► 腾讯云 COS（图片/视频）
```

---

## 一、开通腾讯云资源

### 1.1 购买 CVM
1. 控制台 https://console.cloud.tencent.com/cvm → 新建
2. 推荐配置：
   - 计费：按量计费（先试，便宜）
   - 镜像：**Ubuntu 22.04 LTS 64位**
   - 机型：S5.SMALL2（2核2G）
   - 带宽：按流量 1Mbps 起步
   - 登录方式：设置密码（记住）
3. 创建完成 → 复制公网 IP（下文以 `1.2.3.4` 占位）

### 1.2 开通对象存储 COS
1. 控制台 https://console.cloud.tencent.com/cos → 开通
2. 新建存储桶（Bucket）：
   - 名称：`couple-memory-1300000000`（数字是你的 APPID，会自动生成，记下完整名称）
   - 地域：和 CVM 同地域（比如都选「上海」），同地域走内网不计流量
   - 访问权限：**公有读私有写**（因为图片要让浏览器直接访问）
3. 进入桶 → 概览 → 记下「访问域名」，形如 `couple-memory-1300000000.cos.ap-shanghai.myqcloud.com`

### 1.3 创建 COS 专用子账号（不要用主账号密钥！）
1. 控制台 https://console.cloud.tencent.com/cam → 新建用户 → 自定义创建 → 可访问资源并接收消息
2. 用户名：`couple-memory-api`
3. 权限策略：搜索 `QcloudCOSFullAccess` 添加（如要更安全可创建只授权该 Bucket 的自定义策略）
4. 创建完后 → API 密钥管理 → 新建密钥 → 记下 `SecretId` 和 `SecretKey`（**只显示一次**）

### 1.4 开放安全组端口
CVM 实例 → 安全组 → 入站规则添加：
- HTTP（80）来源 0.0.0.0/0 允许
- SSH（22）来源 0.0.0.0/0（建议改成只允许你的 IP）

---

## 二、连接到服务器

Windows PowerShell：
```powershell
ssh root@1.2.3.4
```
首次提示 fingerprint 输入 `yes`，再输入密码。

---

## 三、服务器环境安装

```bash
apt update
apt install -y nginx git curl build-essential

# 安装 Node.js 20（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安装 pm2（Node.js 进程守护）
npm install -g pm2

# 验证
node -v        # 应显示 v20.x
nginx -v
pm2 -v
```

---

## 四、上传项目代码

**方式 A：本地 PowerShell 用 scp**
```powershell
# 在本地项目目录执行
scp -r e:\AI\couple_memory\* root@1.2.3.4:/var/www/couple_memory/
```

服务器先建目录：
```bash
mkdir -p /var/www/couple_memory
```

**方式 B：WinSCP/FileZilla 拖拽**，SFTP 端口 22。

完成后服务器上应该有：
```
/var/www/couple_memory/
  ├── index.html
  ├── assets/bg.png
  ├── backend/
  │   ├── server.js
  │   ├── db.js
  │   ├── cos.js
  │   ├── package.json
  │   └── .env.example
  └── DEPLOY.md
```

---

## 五、配置后端

```bash
cd /var/www/couple_memory/backend
cp .env.example .env
nano .env
```

把 `.env` 的几个字段填实际值：
```
PORT=3000
ACCESS_PASSWORD=997799        # 想改密码就改这里
DB_PATH=./data.db
COS_SECRET_ID=AKIDxxxxxxxx    # 子账号 SecretId
COS_SECRET_KEY=xxxxxxxxxxxx   # 子账号 SecretKey
COS_BUCKET=couple-memory-1300000000
COS_REGION=ap-shanghai
COS_PREFIX=uploads/
```

保存（Ctrl+O 回车，Ctrl+X 退出），然后：

```bash
npm install --production
# 测试启动一次
node server.js
# 输出 "couple-memory backend listening on :3000" 表示 OK
# Ctrl+C 退出
```

用 pm2 守护：
```bash
pm2 start server.js --name couple-memory
pm2 save
pm2 startup        # 复制它输出的命令再粘贴执行一次，开机自启
```

查看日志：`pm2 logs couple-memory`

---

## 六、配置 Nginx

```bash
nano /etc/nginx/sites-available/default
```

把整个 `server { ... }` 替换为：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    root /var/www/couple_memory;
    index index.html;

    # 静态资源（大视频上传要这个）
    client_max_body_size 100M;

    location / {
        try_files $uri $uri/ =404;
    }

    # API 反向代理到 Node
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

测试配置 + 重载：
```bash
nginx -t
systemctl reload nginx
```

---

## 七、访问测试

浏览器打开 `http://1.2.3.4`：
1. 应该看到 B612 锁屏页（带星球动画）
2. 输入密码 `997799`（或你在 .env 里改的密码）
3. 进入主界面 → 试着 + 投递信件，上传一张图，保存
4. 上传成功后，刷新页面 → 数据应还在（因为存进了 SQLite）
5. 换手机/换浏览器输密码进，应该看到**同样的内容**

---

## 八、常见问题排查

**密码输完一直说错**：
- 看 pm2 日志：`pm2 logs couple-memory`
- 检查 .env 的 `ACCESS_PASSWORD` 是否和你输入的一致
- 浏览器 F12 → Network 看 `/api/bootstrap` 返回什么

**上传图片失败 `upload failed`**：
- 多半是 COS 配置不对。看 pm2 日志里的具体错误
- 常见原因：`SecretId/SecretKey` 错、`Bucket` 名拼错、`Region` 不匹配
- 子账号没授权 COS 权限

**图片上传成功但浏览器显示不出来**：
- 检查 Bucket 是否设为「公有读」
- 浏览器 F12 → Console 看是否被 CORS 阻拦。如有：COS 控制台 → 桶 → 安全管理 → 跨域访问 CORS 设置 → 来源加 `*` 或你的域名

**文件超过 1MB 上传失败**：
- Nginx 的 `client_max_body_size` 已设 100M，应该够
- 如还失败，看是不是 multer 限制（server.js 已设 100MB）

---

## 九、数据备份建议

SQLite 数据库就是一个文件 `backend/data.db`，定期备份它就保住了所有文字数据：

```bash
# 加个 crontab 每天凌晨 3 点拷贝一份
crontab -e
# 加入一行：
0 3 * * * cp /var/www/couple_memory/backend/data.db /root/backups/data-$(date +\%Y\%m\%d).db
```

COS 的文件本身腾讯云有多副本，不用额外备份。

---

## 十、后续可扩展

- **绑定域名 + HTTPS**：备案完域名后，用 Let's Encrypt 免费证书 `certbot --nginx`
- **多用户支持**：现在是单密码（夫妻共用），将来可以加注册/登录
- **接 CDN**：COS 桶可绑定腾讯云 CDN，移动端访问图片更快
- **图片压缩**：上传时在后端用 sharp 压一下，省流量
