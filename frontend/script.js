// HTML文書のすべての要素が読み込まれて準備ができたときに、中のコードを実行します
document.addEventListener('DOMContentLoaded', () => {
    // --- HTML要素の取得 ---
    // これから操作するHTML要素を、id属性などを元に取得して変数に格納します
    const sidebarButtons = document.querySelectorAll('.sidebar nav button');
    const contentSections = document.querySelectorAll('.content-section');

    // (学習機能の要素)
    const learnChatHistory = document.getElementById('learn-chat-history');
    const learnUserInput = document.getElementById('learn-user-input');
    const learnSendBtn = document.getElementById('learn-send-btn');
    const startLearningBtn = document.getElementById('start-learning-btn');
    const createNoteBtn = document.getElementById('create-note-btn');

    // (学習ノートの要素)
    const notesList = document.getElementById('notes-list');

    // (質問機能の要素)
    const chatHistory = document.getElementById('chat-history');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const saveBtn = document.getElementById('save-btn');
    const clearBtn = document.getElementById('clear-btn');
    const resizer = document.getElementById('resizer');
    const pdfViewer = document.getElementById('pdf-viewer');

    // (問題機能の要素)
    const chapterSelection = document.getElementById('chapter-selection');
    const problemDisplayArea = document.getElementById('problem-display-area');
    const problemStatement = document.getElementById('problem-statement');
    const problemFeedback = document.getElementById('problem-feedback');
    const hintBtn = document.getElementById('hint-btn');
    const answerBtn = document.getElementById('answer-btn');
    const submissionInput = document.getElementById('submission-input');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    const backToChaptersBtn = document.getElementById('back-to-chapters-btn');
    
    // (保存機能の要素)
    const savedList = document.getElementById('saved-list');

    // --- グローバル変数 ---
    let current_thread_id = null; // 質問チャット用のスレッドID
    let current_problem = null; // 現在表示されている問題文

    // --- 関数の定義 ---
    const userId = getOrCreateUserId();

    // ユーザーIDを取得または新規作成する関数
    function getOrCreateUserId() {
        // ブラウザのストレージから'manabichat_userId'というキーで値を取得
        let userId = localStorage.getItem('manabichat_userId');
        // もしuserIdがなければ（初めてのアクセスなら）
        if (!userId) {
            // 現在時刻とランダムな文字列を組み合わせて、ユニークなIDを生成
            userId = 'user_' + Date.now() + Math.random().toString(36).substring(2, 15);
            // 生成したIDをストレージに保存
            localStorage.setItem('manabichat_userId', userId);
        }
        // 取得または生成したuserIdを返す
        return userId;
    }

    // 1. サイドバーでのコンテンツ切り替え機能
    sidebarButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 全てのボタンとセクションから 'active' クラスを削除
            sidebarButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));

            // クリックされたボタンに 'active' クラスを追加
            button.classList.add('active');
            
            // 対応するセクションを表示
            const targetId = button.id.replace('show-', '') + '-section';
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // 各タブを開いたときに必要なデータを読み込む
            if (targetId === 'saved-section') {
                loadSavedChats();
            }
            if (targetId === 'notes-section') {
                loadLearningNotes();
            }
        });
    });
    
    // --- 「学習する」機能のロジック ---

    // 2-1. 学習チャット履歴にメッセージを追加する関数
    function addLearnMessageToHistory(message, sender) {
        // メッセージ全体のコンテナとなるp要素を作成
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-message' : 'ai-message';

        // メッセージ本文を格納するdiv要素を作成
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content'; // 本文を特定するためのクラス
        contentDiv.innerHTML = sender === 'ai' ? marked.parse(message) : message;
        // p要素の子として本文divを追加
        p.appendChild(contentDiv);
        
        // AIからのメッセージの場合、右上に「ノートに保存」ボタンを追加する
        if (sender === 'ai') {
            const saveButton = document.createElement('button');
            saveButton.className = 'save-note-from-message-btn';
            saveButton.innerText = 'ノートに保存';
            p.appendChild(saveButton); // p要素の子としてボタンを追加
        }

        // 完成したメッセージ要素をチャット履歴に追加
        learnChatHistory.appendChild(p);
        learnChatHistory.scrollTop = learnChatHistory.scrollHeight;
    }

    // 2-2. 学習チャットのメッセージを送信する関数
    async function sendLearnMessage(message) {
        addLearnMessageToHistory(message, 'user'); // 自分のメッセージを表示
        learnUserInput.value = ''; // 入力欄をクリア

        // ローディング表示を動的に生成して追加
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading-indicator';
        loadingElement.innerHTML = `<p class="ai-message">考え中...<span>.</span><span>.</span><span>.</span></p>`;
        learnChatHistory.appendChild(loadingElement);
        learnChatHistory.scrollTop = learnChatHistory.scrollHeight;

        try {
            // バックエンドの新しい/api/learnにリクエストを送信
            const response = await fetch('http://localhost:8000/api/learn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, message: message }),
            });
            const data = await response.json(); // 応答をJSONとして解析
            addLearnMessageToHistory(data.response, 'ai'); // AIの応答を表示
        } catch (error) {
            console.error('Error:', error); // エラーをコンソールに表示
            addLearnMessageToHistory('エラーが発生しました。', 'ai'); // エラーメッセージを表示
        } finally {
            // 成功・失敗に関わらずローディング表示を削除
            loadingElement.remove();
        }
    }
    
    // 2-3. 「はじめよう！」ボタンのクリックイベント
    startLearningBtn.addEventListener('click', () => {
        // 「学習を開始します」というメッセージを送信して会話を始める
        sendLearnMessage("学習を開始します。よろしくお願いします。");
        // ボタン自体を非表示にする
        startLearningBtn.style.display = 'none';
    });

    // 2-4. 学習チャットの送信ボタン・Enterキーのイベント
    learnSendBtn.addEventListener('click', () => {
        const message = learnUserInput.value.trim();
        if (message) { sendLearnMessage(message); }
    });
    learnUserInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { learnSendBtn.click(); }
    });

    // 2-5. 学習ページの履歴を読み込む関数
    async function loadLearnHistory() {
        try {
            // サーバーに学習履歴を問い合わせる
            const response = await fetch(`/api/learn_history/${userId}`);
            const data = await response.json();
            learnChatHistory.innerHTML = ''; // いったん履歴表示をクリア
            // 履歴が存在すれば
            if (data.history && data.history.length > 0) {
                // 各メッセージを画面に表示
                data.history.forEach(item => {
                    const sender = item.role === 'assistant' ? 'ai' : 'user';
                    addLearnMessageToHistory(item.content, sender);
                });
                // 履歴があれば「はじめよう」ボタンは非表示にする
                startLearningBtn.style.display = 'none';
            } else {
                // 履歴がなければ「はじめよう」ボタンを表示する
                startLearningBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('学習履歴の読み込みに失敗:', error);
        }
    }

    // --- 「学習ノート」機能のロジック ---
    // 3-1. 「学習ノートを作成」ボタンのクリックイベント
    createNoteBtn.addEventListener('click', () => {
        sendLearnMessage("学習ノートをつくりたい");
    });

    // 3-2. AIメッセージの「ノートに保存」ボタンのクリックイベント（イベント移譲）
    learnChatHistory.addEventListener('click', async (e) => {
        // クリックされたのが保存ボタンか確認
        if (e.target.classList.contains('save-note-from-message-btn')) {
            // ノートのタイトルをユーザーに入力してもらう
            const title = prompt('この学習ノートのタイトルを入力してください:');
            // タイトルが入力された場合
            if (title) {
                // ボタンの親要素（p.ai-message）から、本文が格納されているdiv(.message-content)を探す
                const contentElement = e.target.parentElement.querySelector('.message-content');
                // もし本文要素が見つかれば
                if (contentElement) {
                    // 本文のHTMLを取得
                    const content = contentElement.innerHTML;
                    try {
                        // バックエンドにノート保存をリクエスト
                        await fetch('http://localhost:8000/api/save_note', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: userId, title: title, content: content }),
                        });
                        alert('学習ノートを保存しました！');
                    } catch (error) {
                        console.error('ノートの保存に失敗しました:', error);
                        alert('ノートの保存に失敗しました。');
                    }
                }
            }
        }
    });

    // 3-3. 保存された学習ノートを読み込んで表示する関数
    async function loadLearningNotes() {
        try {
            // バックエンドからノート一覧を取得
            const response = await fetch(`/api/notes/${userId}`);
            const data = await response.json();
            // ノート一覧表示エリアをクリア
            notesList.innerHTML = '';
            // ノートがなければメッセージを表示
            if (data.notes.length === 0) {
                notesList.innerHTML = '<p>保存された学習ノートはありません。</p>';
                return;
            }
            // 各ノートをカードとして表示
            data.notes.forEach(note => {
                const card = document.createElement('div');
                card.className = 'note-card';
                card.innerHTML = `<h3>${note.title}</h3><div class="note-content">${note.content}</div>`;
                notesList.appendChild(card);
            });
        } catch (error) {
            console.error('学習ノートの読み込みに失敗:', error);
        }
    }
    
    // --- 「質問する」機能のロジック ---
    // 4-1. 質問チャット履歴にメッセージを追加
    function addMessageToHistory(message, sender) {
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-message' : 'ai-message';
        p.innerHTML = sender === 'ai' ? marked.parse(message) : message;
        chatHistory.appendChild(p);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // 4-2. 質問チャットのメッセージを送信
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;
        addMessageToHistory(message, 'user');
        userInput.value = '';
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading-indicator';
        loadingElement.innerHTML = `<p class="ai-message">考え中...<span>.</span><span>.</span><span>.</span></p>`;
        chatHistory.appendChild(loadingElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
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
        } finally {
            loadingElement.remove();
        }
    }
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // 4-3. 新しい質問チャットを開始
    clearBtn.addEventListener('click', () => {
        chatHistory.innerHTML = '';
        current_thread_id = null;
    });

    // 4-4. 質問チャットを保存
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

    // --- 「保存した会話」機能のロジック ---
    // 5-1. 保存済み会話リストの表示
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

    // 5-2. 保存済み会話の読み込み
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

    // --- 「問題を見る」機能のロジック ---
    // 6-1. 章選択ボタンを生成
    const chapters = [
        "第1章 Pythonに触れる", "第2章 Pythonの基本", "第3章 制御構文",
        "第4章 データ構造", "第5章 関数", "第6章 クラス",
        "第7章 ファイル操作", "第8章 モジュール・ライブラリ"
    ];
    chapters.forEach(chapterTitle => {
        const button = document.createElement('button');
        button.className = 'chapter-btn';
        button.innerText = chapterTitle;
        button.addEventListener('click', () => generateProblem(chapterTitle));
        chapterSelection.appendChild(button);
    });

    // 6-2. 問題を生成・表示
    async function generateProblem(chapter) {
        problemDisplayArea.style.display = 'block';
        chapterSelection.style.display = 'none';
        problemStatement.innerHTML = '<div class="loading-indicator"><p class="ai-message">問題を作成中...<span>.</span><span>.</span><span>.</span></p></div>';
        problemFeedback.innerText = 'ここにヒントや採点結果が表示されます。';
        submissionInput.value = '';
        const data = await callProblemAPI('generate', { chapter: chapter });
        if (data) {
            current_problem = data.response;
            problemStatement.innerHTML = marked.parse(current_problem);
        } else {
            problemStatement.innerText = '問題の作成に失敗しました。';
        }
    }
    
    // 6-3. 問題用API呼び出し共通関数
    async function callProblemAPI(action, params = {}) {
        problemFeedback.innerHTML = `<div class="loading-indicator"><p class="ai-message">考え中...<span>.</span><span>.</span><span>.</span></p></div>`;
        try {
            const response = await fetch('http://localhost:8000/api/problem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...params }),
            });
            return await response.json();
        } catch (error) {
            console.error(`${action} の実行中にエラー:`, error);
            problemFeedback.innerText = 'エラーが発生しました。';
            return null;
        }
    }
    
    // 6-4. ヒントを見る
    hintBtn.addEventListener('click', async () => {
        if (!current_problem) return;
        const data = await callProblemAPI('hint', { problem: current_problem });
        if (data) {
            problemFeedback.innerHTML = marked.parse(data.response);
        }
    });

    // 6-5. 答えを見る
    answerBtn.addEventListener('click', async () => {
        if (!current_problem) return;
        const data = await callProblemAPI('answer', { problem: current_problem });
        if (data) {
            problemFeedback.innerHTML = marked.parse(data.response);
        }
    });

    // 6-6. 解答を提出する
    submitAnswerBtn.addEventListener('click', async () => {
        const submission = submissionInput.value.trim();
        if (!current_problem || !submission) return;
        const data = await callProblemAPI('check', {
            problem: current_problem,
            submission: submission
        });
        if (data) {
            problemFeedback.innerHTML = marked.parse(data.response);
        }
    });

    // 6-7. 章選択に戻る
    backToChaptersBtn.addEventListener('click', () => {
        problemDisplayArea.style.display = 'none';
        chapterSelection.style.display = 'grid';
        current_problem = null;
    });

    // --- ユーティリティ機能 ---
    
    // 7. リサイズ機能
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = pdfViewer.offsetWidth;
        const mouseMoveHandler = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const newWidth = startWidth + dx;
            const minPdfWidth = 200;
            const minChatWidth = 350;
            const containerWidth = resizer.parentElement.offsetWidth;
            if (newWidth < minPdfWidth) {
                pdfViewer.style.width = `${minPdfWidth}px`;
            } else if (containerWidth - newWidth < minChatWidth) {
                pdfViewer.style.width = `${containerWidth - minChatWidth}px`;
            } else {
                pdfViewer.style.width = `${newWidth}px`;
            }
        };
        const mouseUpHandler = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });

    // --- 初期化処理 ---
    // ページ読み込み時に、デフォルトで表示される学習ページの履歴を読み込む
    loadLearnHistory();
});