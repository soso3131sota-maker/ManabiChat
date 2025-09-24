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
    const resizer = document.getElementById('resizer');
    const pdfViewer = document.getElementById('pdf-viewer');
    const chapterSelection = document.getElementById('chapter-selection');
    const problemDisplayArea = document.getElementById('problem-display-area');
    const problemStatement = document.getElementById('problem-statement');
    const problemFeedback = document.getElementById('problem-feedback');
    const hintBtn = document.getElementById('hint-btn');
    const answerBtn = document.getElementById('answer-btn');
    const submissionInput = document.getElementById('submission-input');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');

    // --- グローバル変数 ---
    let current_thread_id = null;
    let current_problem = null;

    // --- 関数の定義 ---
    const userId = getOrCreateUserId();

    function getOrCreateUserId() {
        let userId = localStorage.getItem('manabichat_userId');
        if (!userId) {
            userId = 'user_' + Date.now() + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('manabichat_userId', userId);
        }
        return userId;
    }

    // 1. サイドバーでのコンテンツ切り替え機能
    sidebarButtons.forEach(button => {
        button.addEventListener('click', () => {
            sidebarButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            button.classList.add('active');
            const targetId = button.id.replace('show-', '') + '-section';
            document.getElementById(targetId)?.classList.add('active');
            if (targetId === 'saved-section') { loadSavedChats(); }
        });
    });

    // 2. チャット履歴にメッセージを追加する関数
    function addMessageToHistory(message, sender) { /* ... (変更なし) ... */ }

    // 3. チャット送信機能
    sendBtn.addEventListener('click', async () => { /* ... (変更なし) ... */ });
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendBtn.click(); });

    // 4. 「新しいチャット」機能
    clearBtn.addEventListener('click', () => { /* ... (変更なし) ... */ });

    // 5. 「この会話を保存」機能
    saveBtn.addEventListener('click', async () => { /* ... (変更なし) ... */ });

    // 6. 保存済み会話リストの表示機能
    async function loadSavedChats() { /* ... (変更なし) ... */ }

    // 7. 保存済み会話の読み込み機能
    savedList.addEventListener('click', async (e) => { /* ... (変更なし) ... */ });

    // 8. リサイズ機能のロジック
    resizer.addEventListener('mousedown', (e) => { /* ... (変更なし) ... */ });

    // --- 「問題機能」のロジック ---

    // 9. 章選択ボタンを動的に生成する
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

    // 10. 問題を生成して表示する関数
    async function generateProblem(chapter) {
        problemDisplayArea.style.display = 'block';
        chapterSelection.style.display = 'none';
        problemStatement.innerHTML = '<div class="loading-indicator"><p class="ai-message">問題を作成中...<span>.</span><span>.</span><span>.</span></p></div>';
        problemFeedback.innerText = 'ここにヒントや採点結果が表示されます。';
        submissionInput.value = '';

        const data = await callProblemAPI('generate', { chapter: chapter });
        if (data) {
            current_problem = data.response;
            // ▼ここから変更: innerText を innerHTML = marked.parse() に変更▼
            // これにより、問題文にMarkdown形式が使われていても正しく表示される
            problemStatement.innerHTML = marked.parse(current_problem);
            // ▲ここまで変更▲
        } else {
            problemStatement.innerText = '問題の作成に失敗しました。';
        }
    }
    
    // 11. ヒント、解答、採点リクエストのための共通API呼び出し関数
    async function callProblemAPI(action, params = {}) {
        problemFeedback.innerHTML = `<div class="loading-indicator"><p class="ai-message">考え中...<span>.</span><span>.</span><span>.</span></p></div>`;
        try {
            const response = await fetch('http://localhost:8000/api/problem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action,
                    chapter: params.chapter,
                    problem: params.problem,
                    submission: params.submission
                }),
            });
            return await response.json();
        } catch (error) {
            console.error(`${action} の実行中にエラー:`, error);
            problemFeedback.innerText = 'エラーが発生しました。';
            return null;
        }
    }
    
    // 12. 「ヒントを見る」ボタンのクリックイベント
    hintBtn.addEventListener('click', async () => {
        if (!current_problem) return;
        const data = await callProblemAPI('hint', { problem: current_problem });
        if (data) {
            // ▼ここから変更: innerText を innerHTML = marked.parse() に変更▼
            problemFeedback.innerHTML = marked.parse(data.response);
            // ▲ここまで変更▲
        }
    });

    // 13. 「答えを見る」ボタンのクリックイベント
    answerBtn.addEventListener('click', async () => {
        if (!current_problem) return;
        const data = await callProblemAPI('answer', { problem: current_problem });
        if (data) {
            problemFeedback.innerHTML = marked.parse(data.response);
        }
    });

    // 14. 「解答する」ボタンのクリックイベント
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

    // --- (重複しないように、変更のない関数は省略) ---
    function addMessageToHistory(message, sender) {
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-message' : 'ai-message';
        p.innerHTML = sender === 'ai' ? marked.parse(message) : message;
        chatHistory.appendChild(p);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
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
});