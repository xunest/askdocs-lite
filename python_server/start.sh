#!/bin/bash
# RAG 智能问答系统 - Python 后端启动脚本

cd "$(dirname "$0")"

echo "=========================================="
echo "  RAG 智能问答系统 (Python + LangChain)"
echo "=========================================="
echo ""

# 检查 Python 依赖
echo "检查依赖..."
python3 -c "import fastapi, langchain, chromadb" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "安装 Python 依赖..."
    python3 -m pip install -r requirements.txt
fi

echo ""
echo "启动服务器..."
echo "后端地址: http://localhost:3000"
echo "前端地址: http://localhost:5173"
echo ""
echo "提示: 请先在前端配置大模型 API（需要 Embedding 模型）"
echo ""

python3 main.py
