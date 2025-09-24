// --- HTML要素の取得 ---
// id属性を元に、操作したいHTML要素を変数に格納します
const chatBox = document.getElementById('chat-box'); // チャットメッセージが表示される領域
const userInput = document.getElementById('user-input'); // ユーザーがメッセージを入力するテキストボックス
const sendButton = document.getElementById('send-button'); // 送信ボタン
const newChatButton = document.getElementById('new-chat-button'); // 「新しいチャット」ボタン
const saveButton = document.getElementById('save-button'); // 「この会話を保存」ボタン
const savedChatsList = document.getElementById('saved-chats-list'); // 保存済みチャット一覧が表示される領域
const chatTitle = document.getElementById('chat-title'); // 現在のチャットのタイトルを表示する領域

// --- グローバル変数 ---
// アプリケーション全体で共有して使う変数を定義します
let current_thread_id = null; // 現在の会話のスレッドIDを管理します。最初は何もありません

// --- 関数の定義 ---

// ユーザーIDをブラウザのLocalStorageから取得、または新規作成する関数
function getOrCreateUserId() {
    // ブラウザのストレージから'userId'というキーで値を取得します
    let userId = localStorage.getItem('userId');
    // もしuserIdがなければ（初めてのアクセスなら）
    if (!userId) {
        // 現在時刻とランダムな文字列を組み合わせて、ユニークなIDを生成します
        userId = 'user_' + Date.now() + Math.random().toString(36).substring(2, 15);
        // 生成したIDを'userId'というキーでブラウザのストレージに保存します
        localStorage.setItem('userId', userId);
    }
    // 取得または生成したuserIdを返します
    return userId;
}
// 上記の関数を実行して、ユーザーIDを取得・確定します
const userId = getOrCreateUserId();

// 「新しいチャット」を開始するための関数
function startNewChat() {
    // 現在のスレッドIDをリセットします
    current_thread_id = null;
    // チャットボックスの中身を空にします
    chatBox.innerHTML = '';
    // チャットのタイトルを「新規チャット」に戻します
    chatTitle.innerText = '新規チャット';
    // 入力ボックスを空にします
    userInput.value = '';
    // 入力ボックスにフォーカスを当てて、すぐ入力できるようにします
    userInput.focus();
}

// メッセージをチャットボックスの画面に追加する関数
function addMessage(message, sender) {
    // 新しいdiv要素を作成します（これがメッセージの吹き出しになります）
    const messageElement = document.createElement('div');
    // CSSクラス 'message' と、送信者に応じたクラス ('user-message' or 'bot-message') を追加します
    messageElement.classList.add('message', `${sender}-message`);
    // 送信者が 'bot' ならMarkdownをHTMLに変換、'user' ならテキストをそのまま表示します
    messageElement.innerHTML = sender === 'bot' ? marked.parse(message) : message;
    // 作成したメッセージ要素をチャットボックスに追加します
    chatBox.appendChild(messageElement);
    // チャットボックスを一番下までスクロールして、最新のメッセージが見えるようにします
    chatBox.scrollTop = chatBox.scrollHeight;
}

// メッセージをバックエンドに送信する関数
async function sendMessage() {
    // 入力ボックスから余分な空白を除いたテキストを取得します
    const message = userInput.value.trim();
    // もしメッセージが空なら、何もしないで処理を終了します
    if (message === '') return;

    // 自分のメッセージを画面に追加します
    addMessage(message, 'user');
    // 入力ボックスを空にします
    userInput.value = '';

    try {
        // fetch APIを使って、バックエンドの'/api/chat'にPOSTリクエストを送信します
        const response = await fetch('http://localhost:8000/api/chat', {
            method: 'POST', // HTTPメソッド
            headers: { 'Content-Type': 'application/json' }, // ヘッダー情報
            // リクエストの本体（JSON形式でデータを送信）
            body: JSON.stringify({
                message: message, // 入力されたメッセージ
                thread_id: current_thread_id // 現在のスレッドID
            }),
        });
        // サーバーからの応答をJSONとして解析します
        const data = await response.json();
        // サーバーから返された新しいスレッドIDで、グローバル変数を更新します
        current_thread_id = data.thread_id; 
        // AIからの応答メッセージを画面に追加します
        addMessage(data.response, 'bot');
    } catch (error) {
        // もし通信などでエラーが発生したら、コンソールにエラーを表示します
        console.error('Error:', error);
        // 画面にエラーメッセージを表示します
        addMessage('エラーが発生しました。', 'bot');
    }
}

// 現在の会話を保存する関数
async function saveChat() {
    // もしまだ会話が始まっていなければ（スレッドIDがなければ）
    if (!current_thread_id) {
        // アラートを表示して処理を中断します
        alert('メッセージを送信してから保存してください。');
        return;
    }
    // タイトルを入力するためのプロンプト（入力ダイアログ）を表示します
    const title = prompt('この会話のタイトルを入力してください:', 'Pythonの学習');
    // もしタイトルが入力されたら（キャンセルされなかったら）
    if (title) {
        try {
            // バックエンドの'/api/save'にPOSTリクエストを送信します
            await fetch('http://localhost:8000/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    thread_id: current_thread_id,
                    title: title
                }),
            });
            // 保存成功のアラートを表示します
            alert('会話を保存しました！');
            // サイドバーの保存済みチャット一覧を再読み込みして、最新の状態にします
            loadSavedChats();
        } catch (error) {
            // もしエラーが発生したら
            console.error('保存に失敗しました:', error);
            alert('保存に失敗しました。');
        }
    }
}

// 保存された会話の一覧をサイドバーに読み込む関数
async function loadSavedChats() {
    try {
        // バックエンドの'/api/chats/{userId}'にGETリクエストを送信します
        const response = await fetch(`http://localhost:8000/api/chats/${userId}`);
        const data = await response.json();
        // サイドバーのリストを一度空にします
        savedChatsList.innerHTML = '';
        // 取得したチャット一覧の各データに対して、ループ処理を行います
        data.chats.forEach(chat => {
            // 新しいdiv要素（リストの各項目）を作成します
            const item = document.createElement('div');
            // CSSクラス 'saved-chat-item' を追加します
            item.className = 'saved-chat-item';
            // 要素のテキストにチャットのタイトルを設定します
            item.innerText = chat.title;
            // この項目がクリックされたときの動作を設定します
            item.onclick = () => loadChatHistory(chat.thread_id, chat.title);
            // 作成した項目をサイドバーのリストに追加します
            savedChatsList.appendChild(item);
        });
    } catch (error) {
        console.error('保存済みチャットの読み込みに失敗:', error);
    }
}

// 特定の会話の履歴をチャットボックスに読み込む関数
async function loadChatHistory(threadId, title) {
    try {
        // バックエンドの'/api/history/{threadId}'にGETリクエストを送信します
        const response = await fetch(`http://localhost:8000/api/history/${threadId}`);
        const data = await response.json();
        // チャットボックスを一度空にします
        chatBox.innerHTML = '';
        // 取得した履歴の各メッセージに対して、ループ処理を行います
        data.history.forEach(item => {
            // メッセージの'role'が'assistant'なら'bot'、そうでなければ'user'を送信者とします
            const sender = item.role === 'assistant' ? 'bot' : 'user';
            // メッセージを画面に追加します
            addMessage(item.content, sender);
        });
        // 現在のスレッドIDを、読み込んだ会話のIDに切り替えます
        current_thread_id = threadId;
        // チャットのタイトルを、読み込んだ会話のタイトルに設定します
        chatTitle.innerText = title;
    } catch (error) {
        console.error('履歴の読み込みに失敗:', error);
    }
}

// --- イベントリスナーの設定 ---
// 各ボタンや入力ボックスに対するイベント（クリックやキー入力など）を監視し、対応する関数を実行するように設定します

// 送信ボタンがクリックされたら、sendMessage関数を実行します
sendButton.addEventListener('click', sendMessage);
// 入力ボックスでキーが押されたとき、そのキーがEnterキーならsendMessage関数を実行します
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
// 「新しいチャット」ボタンがクリックされたら、startNewChat関数を実行します
newChatButton.addEventListener('click', startNewChat);
// 「保存」ボタンがクリックされたら、saveChat関数を実行します
saveButton.addEventListener('click', saveChat);

// ページが完全に読み込まれたときに実行される処理
window.addEventListener('load', () => {
    // まずは新しいチャットとして開始します
    startNewChat();
    // サイドバーに保存済みチャットの一覧を読み込みます
    loadSavedChats();
});