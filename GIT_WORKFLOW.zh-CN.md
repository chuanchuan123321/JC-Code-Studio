# Git 工作流程 | Git Workflow

## 查看当前状态 | Check Current Status

```bash
git status
```

## 添加文件到暂存区 | Add Files to Staging Area

```bash
# 添加所有更改的文件
git add .

# 或添加特定文件
git add 文件名
```

## 提交更改 | Commit Changes

```bash
# 使用双语提交信息
git commit -m "feat: 简短描述 | Short description

- 详细说明1 | Detail 1
- 详细说明2 | Detail 2

Co-Authored-By: 你的名字"
```

## 推送到远程仓库 | Push to Remote Repository

```bash
# 推送到 main 分支
git push origin main

# 或简化命令（已设置上游分支）
git push
```

## 完整工作流示例 | Complete Workflow Example

```bash
# 1. 查看当前状态
git status

# 2. 添加所有更改
git add .

# 3. 提交更改
git commit -m "feat: 添加新功能 | Add new feature

- 实现用户认证 | Implement user authentication
- 添加数据库连接 | Add database connection

Co-Authored-By: Vibe-Coding Team"

# 4. 推送到 GitHub
git push
```

## 常用 Git 命令 | Common Git Commands

### 查看提交历史
```bash
git log --oneline
```

### 查看分支
```bash
git branch -a
```

### 创建新分支
```bash
git checkout -b feature/新功能名称
```

### 切换分支
```bash
git checkout main
```

### 合并分支
```bash
git merge feature/新功能名称
```

### 拉取远程更新
```bash
git pull origin main
```

## 项目特定命令 | Project-Specific Commands

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

## 提交信息格式 | Commit Message Format

### feat: 新功能
```bash
git commit -m "feat: 添加用户登录功能 | Add user login feature"
```

### fix: 修复问题
```bash
git commit -m "fix: 修复预览面板显示问题 | Fix preview panel display issue"
```

### docs: 文档更新
```bash
git commit -m "docs: 更新README安装说明 | Update README installation guide"
```

### style: 代码格式
```bash
git commit -m "style: 统一代码缩进格式 | Standardize code indentation"
```

### refactor: 代码重构
```bash
git commit -m "refactor: 优化组件结构 | Optimize component structure"
```

### test: 测试相关
```bash
git commit -m "test: 添加单元测试 | Add unit tests"
```

### chore: 构建/工具
```bash
git commit -m "chore: 更新依赖版本 | Update dependency versions"
```

## 快速参考 | Quick Reference

### 完整更新流程
```bash
git add .
git commit -m "描述"
git push
```

### 查看远程仓库地址
```bash
git remote -v
```

### 修改远程仓库地址
```bash
git remote set-url origin <新地址>
```

### 查看最近3次提交
```bash
git log -3 --oneline
```

### 撤销上次提交（谨慎使用）
```bash
git reset --soft HEAD~1
```

---

**仓库地址：** https://github.com/chuanchuan123321/JC-Code-Studio

**当前分支：** main

**远程：** origin
