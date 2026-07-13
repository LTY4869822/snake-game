# 🐍 Snake Pro - 贪吃蛇网页版

全栈贪吃蛇游戏，支持 5 种游戏模式、道具系统、皮肤商店、成就系统、全球排行榜。

> 🎮 **在线游玩：** [https://Litianyu.github.io/snake-game](https://Litianyu.github.io/snake-game)（GitHub Pages 纯静态版，本地数据存储）

## ✨ 功能特性

### 游戏功能
- 🎮 **5种游戏模式**：经典 / 限时 / 障碍 / 穿墙 / 无尽
- 💎 **道具系统**：双倍分数、减速、护盾、缩短、磁铁
- 🎨 **皮肤商店**：12 款精美皮肤，含粒子特效皮肤
- 🏆 **成就系统**：25 项成就挑战
- 🏅 **排行榜**：本地排行 + 全球云端排行（需后端）
- 🌓 **双主题**：暗夜霓虹 / 清新森系，一键切换
- 📱 **响应式布局**：PC + 移动端完美适配

### 技术亮点
- Canvas 60fps 游戏渲染
- Web Audio API 程序化音效（无需音频文件）
- 玻璃拟态 UI 设计语言
- JWT 用户认证 + 云端数据同步（需后端）
- 离线优先：无后端也能完整游玩，数据存 localStorage

## 🚀 快速开始

### 纯静态版（无需后端）
直接打开 `index.html` 或用任意 HTTP 服务器 serve 根目录即可游玩。
所有游戏数据保存在浏览器本地存储。

### 完整版（含后端）
```bash
cd backend
npm install
node server.js
```
访问 `http://localhost:3000`

## 📁 项目结构

```
snake-game/
├── index.html                 # 入口 HTML
├── auth.html                  # 登录/注册页
├── css/                       # 样式文件
├── js/                        # JavaScript 模块
│   ├── app.js                 # 应用入口
│   ├── config.js              # 全局配置
│   ├── game/                  # 游戏核心
│   ├── ui/                    # UI 界面
│   ├── audio/                 # 音频
│   ├── storage/               # 本地存储
│   └── network/               # API 客户端
├── backend/                   # 后端代码
│   ├── server.js              # Express 服务入口
│   ├── models/                # 数据模型
│   ├── routes/                # API 路由
│   └── middleware/            # 中间件
└── README.md
```

## 🔧 API 接口（需后端）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| GET | /api/scores/leaderboard | 获取排行榜 |
| POST | /api/scores/submit | 提交分数 |
| GET | /api/users/profile | 用户信息 |
| POST | /api/users/sync | 同步数据 |

## 🛡 反作弊

- 分数逻辑校验：基于游戏时长和理论最高得分率
- 请求频率限制：防止恶意刷榜
- 异常分数自动标记，不纳入排行榜
