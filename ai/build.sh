#!/bin/bash
set -e

echo "Building FastAPI backend with PyInstaller..."

/opt/anaconda3/envs/ai/bin/python -m pip install pyinstaller

/opt/anaconda3/envs/ai/bin/python -m PyInstaller \
  --noconfirm \
  --clean \
  --onedir \
  --name backend \
  --exclude-module torch \
  --exclude-module torchvision \
  --exclude-module torchaudio \
  --exclude-module tensorflow \
  --exclude-module matplotlib \
  --exclude-module scipy \
  --exclude-module pandas \
  --exclude-module spacy \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols \
  --hidden-import uvicorn.protocols.http \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import sqlmodel \
  --collect-all chromadb \
  --hidden-import rfc3987 \
  --collect-data rfc3987_syntax \
  --hidden-import jsonschema \
  --collect-all tokenizers \
  --collect-all onnxruntime \
  --hidden-import instructor \
  --hidden-import docx \
  --hidden-import pydantic \
  --hidden-import database \
  --hidden-import db_models \
  --hidden-import config \
  --hidden-import models \
  --hidden-import pipeline \
  --hidden-import rag \
  --hidden-import llm_client \
  --hidden-import docx_generator \
  --hidden-import routers.reports \
  --hidden-import routers.export \
  main.py

echo "Build complete."
