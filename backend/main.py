# --- ライブラリのインポート ---
import os  # OSの環境変数を扱うため
import sqlite3  # データベースを扱うため
from openai import OpenAI  # OpenAIのAPIを利用するため
from fastapi import FastAPI  # Webサーバーのフレームワーク
from fastapi.middleware.cors import CORSMiddleware  # CORS設定のため
from pydantic import BaseModel  # データ構造を定義・検証するため
import time  # 処理を一時停止するため
from dotenv import load_dotenv  # .envファイルを読み込むため

# .envファイルから環境変数を読み込みます
load_dotenv()

# --- データベースの初期設定 ---
def init_db():
    # データベースに接続
    conn = sqlite3.connect('chat_history.db')
    # SQLコマンドを実行するためのカーソルを作成
    cursor = conn.cursor()
    # 質問チャットの履歴を保存するテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS saved_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
            thread_id TEXT NOT NULL, title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 学習チャットのスレッドIDをユーザーごとに保存するテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS learning_threads (
            user_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL
        )
    ''')
    # 学習ノートを保存するテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS learning_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit() # 変更を保存
    conn.close() # 接続を閉じる
    print("✅ データベースを初期化しました。")

# アプリケーション起動時にDBを初期化
init_db()

# --- FastAPIアプリケーションのセットアップ ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# --- 3体のAIアシスタントを読み込み ---
try:
    # .envから各アシスタントのIDを取得
    assistant_id = os.environ.get("ASSISTANT_ID")
    problem_assistant_id = os.environ.get("PROBLEM_ASSISTANT_ID")
    learning_assistant_id = os.environ.get("LEARNING_ASSISTANT_ID")

    # IDがすべて設定されているか確認
    if not all([assistant_id, problem_assistant_id, learning_assistant_id]):
        raise ValueError("環境変数に必要なアシスタントIDが設定されていません。")
    
    # IDを使ってアシスタントの情報を取得（ロード）
    assistant = client.beta.assistants.retrieve(assistant_id)
    problem_assistant = client.beta.assistants.retrieve(problem_assistant_id)
    learning_assistant = client.beta.assistants.retrieve(learning_assistant_id)
    
    # ターミナルにロード成功を表示
    print(f"✅ 質問用アシスタントをロードしました。")
    print(f"✅ 問題用アシスタントをロードしました。")
    print(f"✅ 学習用アシスタントをロードしました。")

# エラーが発生した場合
except Exception as e:
    print(f"❌ アシスタントのロード中にエラーが発生しました: {e}")
    assistant, problem_assistant, learning_assistant = None, None, None

# --- APIエンドポイントの定義 ---

# 「学習する」機能のAPI
class LearnRequest(BaseModel): user_id: str; message: str
@app.post("/api/learn")
async def learn_chat(request: LearnRequest):
    if learning_assistant is None: return {"response": "サーバーエラー: 学習アシスタントが初期化されていません。"}
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("SELECT thread_id FROM learning_threads WHERE user_id = ?", (request.user_id,)); result = cursor.fetchone()
    if result: thread_id = result[0]
    else:
        thread = client.beta.threads.create(); thread_id = thread.id
        cursor.execute("INSERT INTO learning_threads (user_id, thread_id) VALUES (?, ?)", (request.user_id, thread_id)); conn.commit()
    conn.close()
    client.beta.threads.messages.create(thread_id=thread_id, role="user", content=request.message)
    run = client.beta.threads.runs.create(thread_id=thread_id, assistant_id=learning_assistant.id)
    while run.status in ['queued', 'in_progress']:
        time.sleep(1); run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
    if run.status == 'completed':
        messages = client.beta.threads.messages.list(thread_id=thread_id)
        return {"response": messages.data[0].content[0].text.value}
    else: return {"response": f"エラーが発生しました: {run.status}"}

@app.get("/api/learn_history/{user_id}")
async def get_learn_history(user_id: str):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("SELECT thread_id FROM learning_threads WHERE user_id = ?", (user_id,)); result = cursor.fetchone()
    conn.close()
    if result:
        try:
            messages = client.beta.threads.messages.list(thread_id=result[0], order='asc')
            history = [{"role": msg.role, "content": msg.content[0].text.value} for msg in messages.data]; return {"history": history}
        except Exception: return {"history": []}
    else: return {"history": []}

# 「学習ノート」のAPI
class SaveNoteRequest(BaseModel): user_id: str; title: str; content: str
@app.post("/api/save_note")
async def save_note(request: SaveNoteRequest):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("INSERT INTO learning_notes (user_id, title, content) VALUES (?, ?, ?)", (request.user_id, request.title, request.content))
    conn.commit(); conn.close()
    return {"status": "success"}

@app.get("/api/notes/{user_id}")
async def get_notes(user_id: str):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("SELECT id, title, content, created_at FROM learning_notes WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
    notes = [{"id": row[0], "title": row[1], "content": row[2], "created_at": row[3]} for row in cursor.fetchall()]
    conn.close()
    return {"notes": notes}

# 既存のAPI (変更なし)
class ChatRequest(BaseModel): message: str; thread_id: str | None = None
@app.post("/api/chat")
async def chat(request: ChatRequest):
    if assistant is None: return {"response": "サーバーエラー", "thread_id": None}
    thread_id = request.thread_id
    if thread_id is None: thread = client.beta.threads.create(); thread_id = thread.id
    client.beta.threads.messages.create(thread_id=thread_id, role="user", content=request.message)
    run = client.beta.threads.runs.create(thread_id=thread_id, assistant_id=assistant.id)
    while run.status in ['queued', 'in_progress']:
        time.sleep(1); run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
    if run.status == 'completed':
        messages = client.beta.threads.messages.list(thread_id=thread_id)
        return {"response": messages.data[0].content[0].text.value, "thread_id": thread_id}
    else: return {"response": f"エラー: {run.status}", "thread_id": thread_id}
class ProblemRequest(BaseModel): action: str; chapter: str | None = None; problem: str | None = None; submission: str | None = None
@app.post("/api/problem")
async def handle_problem(request: ProblemRequest):
    if problem_assistant is None: return {"response": "サーバーエラー: 問題アシスタントが初期化されていません。"}
    prompt = ""
    if request.action == 'generate': prompt = f"action: 'generate'\n章のテーマ: '{request.chapter}'"
    elif request.action == 'hint': prompt = f"action: 'hint'\n問題文: '{request.problem}'"
    elif request.action == 'answer': prompt = f"action: 'answer'\n問題文: '{request.problem}'"
    elif request.action == 'check': prompt = f"action: 'check'\n問題文: '{request.problem}'\nユーザーの提出コード:\n```python\n{request.submission}\n```"
    else: return {"response": "無効なアクションです。"}
    try:
        thread = client.beta.threads.create()
        client.beta.threads.messages.create(thread_id=thread.id, role="user", content=prompt)
        run = client.beta.threads.runs.create(thread_id=thread.id, assistant_id=problem_assistant.id)
        while run.status in ['queued', 'in_progress']:
            time.sleep(1); run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        if run.status == 'completed':
            messages = client.beta.threads.messages.list(thread_id=thread.id)
            return {"response": messages.data[0].content[0].text.value}
        else: return {"response": f"エラーが発生しました: {run.status}"}
    except Exception as e:
        print(f"❌ 問題処理中にエラー: {e}"); return {"response": "サーバーでエラーが発生しました。"}
class SaveRequest(BaseModel): user_id: str; thread_id: str; title: str
@app.post("/api/save")
async def save_chat(request: SaveRequest):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("INSERT INTO saved_chats (user_id, thread_id, title) VALUES (?, ?, ?)",(request.user_id, request.thread_id, request.title))
    conn.commit(); conn.close(); return {"status": "success"}
@app.get("/api/chats/{user_id}")
async def get_saved_chats(user_id: str):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("SELECT thread_id, title, created_at FROM saved_chats WHERE user_id = ? ORDER BY created_at DESC",(user_id,))
    chats = [{"thread_id": row[0], "title": row[1], "created_at": row[2]} for row in cursor.fetchall()]; conn.close(); return {"chats": chats}
@app.get("/api/history/{thread_id}")
async def get_history(thread_id: str):
    try:
        messages = client.beta.threads.messages.list(thread_id=thread_id, order='asc')
        history = [{"role": msg.role, "content": msg.content[0].text.value} for msg in messages.data]; return {"history": history}
    except Exception: return {"history": []}