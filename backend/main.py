import os
from openai import OpenAI
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time

# --- OpenAIクライアントの初期化 ---
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
ASSISTANT_ID = os.getenv("ASSISTANT_ID")

app = FastAPI()

# ▼▼▼【重要】この部分がCORSエラーを解決します ▼▼▼
# --- CORSミドルウェアの設定 ---
# フロントエンドからのアクセスを許可する
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 本番環境では "http://localhost:8080" などに限定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

# --- Pydanticモデルの定義 ---
class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str

class ChatResponse(BaseModel):
    thread_id: str
    response: str

# --- Assistant APIとの対話を行うコア関数 ---
def get_assistant_response(thread_id: str | None, user_message: str) -> tuple[str, str]:
    if thread_id is None:
        thread = client.beta.threads.create()
        thread_id = thread.id

    client.beta.threads.messages.create(
        thread_id=thread_id,
        role="user",
        content=user_message
    )

    run = client.beta.threads.runs.create(
        thread_id=thread_id,
        assistant_id=ASSISTANT_ID
    )

    while run.status not in ["completed", "failed"]:
        time.sleep(1)
        run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

    if run.status == "failed":
        return thread_id, "申し訳ありません、エラーが発生しました。"

    messages = client.beta.threads.messages.list(thread_id=thread_id)
    assistant_message = messages.data[0].content[0].text.value
    
    return thread_id, assistant_message

# --- APIエンドポイントの定義 ---
@app.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(request: ChatRequest):
    thread_id, response_text = get_assistant_response(request.thread_id, request.message)
    return ChatResponse(thread_id=thread_id, response=response_text)

@app.get("/")
def read_root():
    return {"message": "ManabiChat Backend is running."}