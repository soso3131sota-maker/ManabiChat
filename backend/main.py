# 必要なライブラリをインポートします
import os  # os: 環境変数など、OSの機能を利用するため
import sqlite3  # sqlite3: サーバー内にファイルとして保存できる簡単なデータベースを操作するため
from openai import OpenAI  # openai: OpenAIのAPIを利用するため
from fastapi import FastAPI, Request  # fastapi: Webサーバーのフレームワーク
from fastapi.middleware.cors import CORSMiddleware  # CORSMiddleware: セキュリティ設定（CORS）のため
from pydantic import BaseModel  # pydantic: リクエストデータの型を定義・検証するため
import time  # time: 処理を一時停止（sleep）するため
from datetime import datetime  # datetime: 日付や時刻を扱うため
from dotenv import load_dotenv  # dotenv: .envファイルから環境変数を読み込むため

# .envファイルに記述された環境変数を読み込みます
load_dotenv()

# --- データベースの初期設定 ---
def init_db():
    # 'chat_history.db'という名前のデータベースファイルに接続します（なければ新規作成）
    conn = sqlite3.connect('chat_history.db')
    # SQLコマンドを実行するためのカーソルを作成します
    cursor = conn.cursor()
    # SQLコマンドを実行: もし'saved_chats'テーブルがなければ、新しく作成します
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS saved_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 変更をデータベースに保存（コミット）します
    conn.commit()
    # データベースとの接続を閉じます
    conn.close()
    # ターミナルに初期化が完了したことを表示します
    print("✅ データベースを初期化しました。(saved_chats)")

# FastAPIアプリケーションの起動時に、上記のデータベース初期化関数を実行します
init_db()

# --- FastAPIアプリケーションのセットアップ ---
# FastAPIのインスタンス（本体）を作成します
app = FastAPI()

# CORS（Cross-Origin Resource Sharing）ミドルウェアを追加します
# これにより、異なるドメイン（今回はlocalhost:8080）からのリクエストを許可します
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # すべてのオリジン（ドメイン）からのアクセスを許可
    allow_credentials=True,  # 認証情報（クッキーなど）を許可
    allow_methods=["*"],  # すべてのHTTPメソッド（GET, POSTなど）を許可
    allow_headers=["*"],  # すべてのHTTPヘッダーを許可
)

# OpenAI APIクライアントを初期化します（APIキーを渡します）
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# --- アシスタントの読み込み ---
try:
    # .envファイルからアシスタントIDを取得します
    assistant_id = os.environ.get("ASSISTANT_ID")
    # もしアシスタントIDが設定されていなければ、エラーを発生させます
    if not assistant_id:
        raise ValueError("環境変数にASSISTANT_IDが設定されていません。")
    
    # IDを使って、OpenAIから既存のアシスタントの情報を取得（ロード）します
    assistant = client.beta.assistants.retrieve(assistant_id)
    # ターミナルにロードが成功したことを表示します
    print(f"✅ アシスタントをロードしました。Assistant ID: {assistant.id}")
# もしエラーが発生した場合
except Exception as e:
    # ターミナルにエラー内容を表示します
    print(f"❌ アシスタントのロード中にエラーが発生しました: {e}")
    # アシスタントの変数をNoneに設定して、後の処理でエラーが起きないようにします
    assistant = None

# --- APIエンドポイントの定義 ---

# フロントエンドから送られてくるチャットリクエストのデータ構造を定義します
class ChatRequest(BaseModel):
    message: str  # ユーザーが入力したメッセージ
    thread_id: str | None = None # 現在の会話のスレッドID（なければNone）

# '/api/chat' というURLに対するPOSTリクエストを処理する関数を定義します
@app.post("/api/chat")
async def chat(request: ChatRequest):
    # もしアシスタントが正常にロードできていなければ、エラーを返します
    if assistant is None:
        return {"response": "サーバーエラー", "thread_id": None}

    # リクエストからスレッドIDを取得します
    thread_id = request.thread_id
    # もしスレッドIDがなければ（会話の最初のメッセージなら）
    if thread_id is None:
        # OpenAIに新しいスレッド（会話の場）の作成をリクエストします
        thread = client.beta.threads.create()
        # 作成されたスレッドのIDを取得します
        thread_id = thread.id
        print(f"新しいスレッドを作成しました: {thread_id}")

    # ユーザーからのメッセージを、指定されたスレッドに追加します
    client.beta.threads.messages.create(
        thread_id=thread_id,
        role="user",
        content=request.message
    )

    # 指定したスレッドとアシスタントで、AIの応答生成処理（Run）を開始します
    run = client.beta.threads.runs.create(thread_id=thread_id, assistant_id=assistant.id)

    # 応答生成処理のステータスが 'queued' (待機中) または 'in_progress' (処理中) の間、ループします
    while run.status in ['queued', 'in_progress']:
        # 1秒間、処理を停止します
        time.sleep(1)
        # OpenAIから最新のRunのステータスを取得し直します
        run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

    # ループを抜け、Runのステータスが 'completed' (完了) なら
    if run.status == 'completed':
        # スレッド内のメッセージ一覧を取得します
        messages = client.beta.threads.messages.list(thread_id=thread_id)
        # 最新のメッセージ（AIからの応答）の内容を取得します
        response_message = messages.data[0].content[0].text.value
        # AIの応答と、現在のスレッドIDをフロントエンドに返します
        return {"response": response_message, "thread_id": thread_id}
    # もしRunが完了しなかった場合
    else:
        # エラーステータスをフロントエンドに返します
        return {"response": f"エラー: {run.status}", "thread_id": thread_id}

# フロントエンドから送られてくる保存リクエストのデータ構造を定義します
class SaveRequest(BaseModel):
    user_id: str
    thread_id: str
    title: str

# '/api/save' というURLに対するPOSTリクエストを処理する関数を定義します
@app.post("/api/save")
async def save_chat(request: SaveRequest):
    # データベースに接続します
    conn = sqlite3.connect('chat_history.db')
    cursor = conn.cursor()
    # SQLのINSERT文を実行して、ユーザーID、スレッドID、タイトルをテーブルに保存します
    cursor.execute(
        "INSERT INTO saved_chats (user_id, thread_id, title) VALUES (?, ?, ?)",
        (request.user_id, request.thread_id, request.title)
    )
    # 変更を保存します
    conn.commit()
    # 接続を閉じます
    conn.close()
    # ターミナルに保存が完了したことを表示します
    print(f"チャットを保存しました: User: {request.user_id}, Thread: {request.thread_id}, Title: {request.title}")
    # フロントエンドに成功ステータスを返します
    return {"status": "success"}

# '/api/chats/{user_id}' というURLに対するGETリクエストを処理する関数を定義します
@app.get("/api/chats/{user_id}")
async def get_saved_chats(user_id: str):
    # データベースに接続します
    conn = sqlite3.connect('chat_history.db')
    cursor = conn.cursor()
    # SQLのSELECT文を実行して、指定されたユーザーIDの保存済みチャット一覧を取得します
    cursor.execute(
        "SELECT thread_id, title, created_at FROM saved_chats WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,)
    )
    # 取得した結果をリスト形式に変換します
    chats = [{"thread_id": row[0], "title": row[1], "created_at": row[2]} for row in cursor.fetchall()]
    # 接続を閉じます
    conn.close()
    # 取得したチャット一覧をフロントエンドに返します
    return {"chats": chats}

# '/api/history/{thread_id}' というURLに対するGETリクエストを処理する関数を定義します
@app.get("/api/history/{thread_id}")
async def get_history(thread_id: str):
    try:
        # 指定されたスレッドIDのメッセージ一覧をOpenAIから取得します（古い順に並べ替え）
        messages = client.beta.threads.messages.list(thread_id=thread_id, order='asc')
        # 取得したメッセージを、フロントエンドで扱いやすい形式のリストに変換します
        history = [{"role": msg.role, "content": msg.content[0].text.value} for msg in messages.data]
        # 変換した履歴リストをフロントエンドに返します
        return {"history": history}
    # もしエラーが発生した場合
    except Exception as e:
        # ターミナルにエラーを表示します
        print(f"履歴の取得中にエラー: {e}")
        # 空の履歴リストを返します
        return {"history": []}