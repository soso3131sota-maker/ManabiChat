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
    conn = sqlite3.connect('chat_history.db') # データベースに接続
    cursor = conn.cursor() # カーソルを作成
    # saved_chats テーブルがなければ作成する
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS saved_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
            thread_id TEXT NOT NULL, title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit() # 変更を保存
    conn.close() # 接続を閉じる
    print("✅ データベースを初期化しました。(saved_chats)")

# アプリケーション起動時にDBを初期化
init_db()

# --- FastAPIアプリケーションのセットアップ ---
app = FastAPI() # FastAPIのインスタンスを作成

# CORSミドルウェアを追加して、異なるオリジンからのリクエストを許可
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# OpenAI APIクライアントを初期化
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# --- アシスタントの読み込み ---
try:
    # .envから質問応答用アシスタントのIDを取得
    assistant_id = os.environ.get("ASSISTANT_ID")
    # .envから問題出題用アシスタントのIDを取得
    problem_assistant_id = os.environ.get("PROBLEM_ASSISTANT_ID")

    # IDが設定されているか確認
    if not assistant_id or not problem_assistant_id:
        raise ValueError("環境変数にASSISTANT_IDまたはPROBLEM_ASSISTANT_IDが設定されていません。")
    
    # IDを使ってアシスタントの情報を取得（ロード）
    assistant = client.beta.assistants.retrieve(assistant_id)
    problem_assistant = client.beta.assistants.retrieve(problem_assistant_id)
    
    # ターミナルにロード成功を表示
    print(f"✅ 質問用アシスタントをロードしました。ID: {assistant.id}")
    print(f"✅ 問題用アシスタントをロードしました。ID: {problem_assistant.id}")

# エラーが発生した場合
except Exception as e:
    print(f"❌ アシスタントのロード中にエラーが発生しました: {e}")
    assistant = None
    problem_assistant = None

# --- APIエンドポイントの定義 ---

# チャットリクエストのデータ構造
class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None

# '/api/chat' エンドポイント（変更なし）
@app.post("/api/chat")
async def chat(request: ChatRequest):
    # ... (この部分は前回から変更ありません)
    if assistant is None: return {"response": "サーバーエラー", "thread_id": None}
    thread_id = request.thread_id
    if thread_id is None:
        thread = client.beta.threads.create()
        thread_id = thread.id
    client.beta.threads.messages.create(thread_id=thread_id, role="user", content=request.message)
    run = client.beta.threads.runs.create(thread_id=thread_id, assistant_id=assistant.id)
    while run.status in ['queued', 'in_progress']:
        time.sleep(1)
        run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
    if run.status == 'completed':
        messages = client.beta.threads.messages.list(thread_id=thread_id)
        response_message = messages.data[0].content[0].text.value
        return {"response": response_message, "thread_id": thread_id}
    else:
        return {"response": f"エラー: {run.status}", "thread_id": thread_id}

# --- ▼ここから「問題機能」のAPIを追加▼ ---

# 問題機能リクエストのデータ構造
class ProblemRequest(BaseModel):
    action: str  # 'generate', 'hint', 'answer', 'check' のいずれか
    chapter: str | None = None # 問題生成時に使用
    problem: str | None = None # ヒント、解答、採点時に使用
    submission: str | None = None # 採点時に使用

# '/api/problem' というURLに対するPOSTリクエストを処理する関数
@app.post("/api/problem")
async def handle_problem(request: ProblemRequest):
    # 問題用アシスタントがロードできていなければエラーを返す
    if problem_assistant is None:
        return {"response": "サーバーエラー: 問題生成アシスタントが初期化されていません。"}

    # AIに渡す指示（プロンプト）を組み立てる
    prompt = ""
    if request.action == 'generate':
        prompt = f"action: 'generate'\n章のテーマ: '{request.chapter}'"
    elif request.action == 'hint':
        prompt = f"action: 'hint'\n問題文: '{request.problem}'"
    elif request.action == 'answer':
        prompt = f"action: 'answer'\n問題文: '{request.problem}'"
    elif request.action == 'check':
        prompt = f"action: 'check'\n問題文: '{request.problem}'\nユーザーの提出コード:\n```python\n{request.submission}\n```"
    else:
        # actionが不正な場合はエラーを返す
        return {"response": "無効なアクションです。"}

    try:
        # 問題機能では、毎回新しいスレッドを作成して、会話が混ざらないようにする
        thread = client.beta.threads.create()
        # 組み立てたプロンプトをメッセージとしてスレッドに追加
        client.beta.threads.messages.create(
            thread_id=thread.id, role="user", content=prompt
        )
        # 問題用アシスタントで応答生成（Run）を開始
        run = client.beta.threads.runs.create(
            thread_id=thread.id, assistant_id=problem_assistant.id
        )

        # 応答が完了するまで待機
        while run.status in ['queued', 'in_progress']:
            time.sleep(1)
            run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)

        # 処理が完了したら
        if run.status == 'completed':
            # スレッドからメッセージ一覧を取得
            messages = client.beta.threads.messages.list(thread_id=thread.id)
            # AIからの最新の応答を取得
            response_message = messages.data[0].content[0].text.value
            # 応答をフロントエンドに返す
            return {"response": response_message}
        else:
            # 失敗した場合はエラーステータスを返す
            return {"response": f"エラーが発生しました: {run.status}"}

    # 予期せぬエラーが発生した場合
    except Exception as e:
        print(f"❌ 問題処理中にエラーが発生しました: {e}")
        return {"response": "サーバーで予期せぬエラーが発生しました。"}

# --- ▲ここまで「問題機能」のAPI▲ ---

# ... (保存、履歴取得のAPIは変更なし)
class SaveRequest(BaseModel): user_id: str; thread_id: str; title: str
@app.post("/api/save")
async def save_chat(request: SaveRequest):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("INSERT INTO saved_chats (user_id, thread_id, title) VALUES (?, ?, ?)",(request.user_id, request.thread_id, request.title))
    conn.commit(); conn.close()
    return {"status": "success"}
@app.get("/api/chats/{user_id}")
async def get_saved_chats(user_id: str):
    conn = sqlite3.connect('chat_history.db'); cursor = conn.cursor()
    cursor.execute("SELECT thread_id, title, created_at FROM saved_chats WHERE user_id = ? ORDER BY created_at DESC",(user_id,))
    chats = [{"thread_id": row[0], "title": row[1], "created_at": row[2]} for row in cursor.fetchall()]
    conn.close()
    return {"chats": chats}
@app.get("/api/history/{thread_id}")
async def get_history(thread_id: str):
    try:
        messages = client.beta.threads.messages.list(thread_id=thread_id, order='asc')
        history = [{"role": msg.role, "content": msg.content[0].text.value} for msg in messages.data]
        return {"history": history}
    except Exception as e: return {"history": []}