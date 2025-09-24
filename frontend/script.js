// HTML文書のすべての要素が読み込まれて準備ができたときに、中のコードを実行します
document.addEventListener('DOMContentLoaded', () => {
    // --- HTML要素の取得 ---
    const sidebarButtons = document.querySelectorAll('.sidebar nav button');
    const contentSections = document.querySelectorAll('.content-section');
    const chatHistory = document.getElementById('chat-history');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const saveBtn = document.getElementById('save-btn');
    const clearBtn = document.getElementById('clear-btn');
    const savedList = document.getElementById('saved-list');
    // ▼ここから追加: リサイズ機能で使う要素を取得▼
    const resizer = document.getElementById('resizer');
    const pdfViewer = document.getElementById('pdf-viewer');
    const chatWrapper = document.getElementById('chat-wrapper');
    // ▲ここまで追加▲

    // --- グローバル変数 ---
    let current_thread_id = null;

    // --- 関数の定義 ---

    // ユーザーIDをブラウザのLocalStorageから取得または新規作成する関数
    function getOrCreateUserId() {
        let userId = localStorage.getItem('manabichat_userId');
        if (!userId) {
            userId = 'user_' + Date.now() + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('manabichat_userId', userId);
        }
        return userId;
    }
    const userId = getOrCreateUserId();

    // 1. サイドバーでのコンテンツ切り替え機能
    sidebarButtons.forEach(button => {
        button.addEventListener('click', () => {
            sidebarButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            button.classList.add('active');
            const targetId = button.id.replace('show-', '') + '-section';
            document.getElementById(targetId)?.classList.add('active');
            if (targetId === 'saved-section') {
                loadSavedChats();
            }
        });
    });

    // 2. メッセージをチャット履歴の画面に追加する関数
    function addMessageToHistory(message, sender) {
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-message' : 'ai-message';
        p.innerHTML = sender === 'ai' ? marked.parse(message) : message;
        chatHistory.appendChild(p);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // 3. チャット送信機能
    sendBtn.addEventListener('click', async () => {
        const message = userInput.value.trim();
        if (message === '') return;
        addMessageToHistory(message, 'user');
        userInput.value = '';
        try {
            const response = await fetch('http://localhost:8000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message, thread_id: current_thread_id }),
            });
            const data = await response.json();
            current_thread_id = data.thread_id;
            addMessageToHistory(data.response, 'ai');
        } catch (error) {
            console.error('Error:', error);
            addMessageToHistory('エラーが発生しました。', 'ai');
        }
    });

    // 入力ボックスでEnterキーが押されたときも送信
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });

    // 4. 「新しいチャット」機能
    clearBtn.addEventListener('click', () => {
        chatHistory.innerHTML = '';
        current_thread_id = null;
    });

    // 5. 「この会話を保存」機能
    saveBtn.addEventListener('click', async () => {
        if (!current_thread_id) {
            alert('メッセージを送信してから保存してください。');
            return;
        }
        const title = prompt('この会話のタイトルを入力してください:', 'Pythonの学習');
        if (title) {
            try {
                await fetch('http://localhost:8000/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, thread_id: current_thread_id, title: title }),
                });
                alert('会話を保存しました！');
            } catch (error) {
                console.error('保存に失敗しました:', error);
                alert('保存に失敗しました。');
            }
        }
    });

    // 6. 保存済み会話リストの表示機能
    async function loadSavedChats() {
        try {
            const response = await fetch(`http://localhost:8000/api/chats/${userId}`);
            const data = await response.json();
            savedList.innerHTML = '';
            if (data.chats.length === 0) {
                savedList.innerHTML = '<li>保存された会話はありません。</li>';
                return;
            }
            data.chats.forEach(chat => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${chat.title}</span><button class="load-chat-btn" data-thread-id="${chat.thread_id}">読込</button>`;
                savedList.appendChild(li);
            });
        } catch (error) {
            console.error('保存済みチャットの読み込みに失敗:', error);
        }
    }

    // 7. 保存済み会話の読み込み機能
    savedList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('load-chat-btn')) {
            const threadId = e.target.dataset.threadId;
            try {
                const response = await fetch(`http://localhost:8000/api/history/${threadId}`);
                const data = await response.json();
                document.getElementById('show-chat').click();
                chatHistory.innerHTML = '';
                data.history.forEach(item => {
                    const sender = item.role === 'assistant' ? 'ai' : 'user';
                    addMessageToHistory(item.content, sender);
                });
                current_thread_id = threadId;
            } catch (error) {
                console.error('履歴の読み込みに失敗:', error);
            }
        }
    });
    
    // ▼ここから追加: リサイズ機能のロジック ▼
    // つまみがマウスで押されたときの処理
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); // デフォルトのイベント（テキスト選択など）を無効化

        // マウスが動いたときの処理を定義
        const mouseMoveHandler = (moveEvent) => {
            // マウスのX座標の移動量を計算
            const dx = moveEvent.clientX - e.clientX;
            // PDFビューアの初期幅を取得
            const pdfInitialWidth = pdfViewer.offsetWidth;
            // 新しい幅を計算（初期幅 + 移動量）
            const newPdfWidth = pdfInitialWidth + dx;
            
            // 新しい幅を適用
            // flex-growプロパティを使って幅を調整するのが、flexboxレイアウトではより安定します
            // chatWrapperのflex-growは1のままなので、pdfViewerの幅が変わると自動的に調整されます
            pdfViewer.style.width = `${newPdfWidth}px`;
        };

        // マウスのボタンが離されたときの処理を定義
        const mouseUpHandler = () => {
            // マウスが動いたとき・離されたときのイベント監視を解除
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };

        // マウスが動いたとき・離されたときのイベント監視を開始
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
    // ▲ここまで追加▲
});