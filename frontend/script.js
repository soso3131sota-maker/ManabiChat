// スレッドIDを保持するためのグローバル変数
let currentThreadId = null;
let savedAnswers = JSON.parse(localStorage.getItem("savedAnswers")) || [];


function showSection(id) {
  document.querySelectorAll('.main-content .section').forEach(sec => sec.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  // 'note'セクション表示時にノートをレンダリング
  if (id === "note") {
    renderSavedAnswers();
  }
}

function toggleBook() {
  const book = document.getElementById("book");
  book.style.display = (book.style.display === "none" || book.style.display === "") ? "block" : "none";
}

// 「はじめよう」ボタンが押された時の処理
async function startChat() {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.remove();
    }
    const chatBox = document.getElementById('chat-box');
    chatBox.style.textAlign = 'left';
    chatBox.innerHTML += `<p><i>AIが準備しています...</i></p>`;

    try {
        const response = await fetch('http://localhost:8000/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                thread_id: null,
                message: "学習を始めます。よろしくお願いします。"
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        currentThreadId = data.thread_id; 
        chatBox.innerHTML = '';
        appendAiMessage(data.response);
    } catch (error) {
        chatBox.innerHTML = `<p style="color: red;">エラーが発生しました。バックエンドが起動しているか確認してください。</p>`;
        console.error("Fetch error:", error);
    }
}

// ユーザーがメッセージを送信した時の処理
async function sendMessage() {
    const input = document.getElementById("user-input");
    const message = input.value;
    if (!message) return;
    input.value = "";
    
    appendUserMessage(message);
    await sendToBackend(message);
}

// 「学習ノートを作る」ボタンが押された時の処理
async function requestNoteCreation() {
    const message = "このチャットのやり取りを元に、ここまでの内容で学習ノートを作りたいです。重要なポイントをまとめてください。";
    appendUserMessage(message);
    await sendToBackend(message);
}

// バックエンドにメッセージを送信する共通関数
async function sendToBackend(message) {
    const chatBox = document.getElementById("chat-box");
    const thinkingIndicator = document.createElement('p');
    thinkingIndicator.id = 'thinking';
    thinkingIndicator.innerHTML = `<i>AIが考えています...</i>`;
    chatBox.appendChild(thinkingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('http://localhost:8000/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                thread_id: currentThreadId,
                message: message
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        document.getElementById('thinking').remove();
        appendAiMessage(data.response);
    } catch (error) {
        document.getElementById('thinking').innerHTML = `<p style="color: red;">メッセージの送信に失敗しました。</p>`;
        console.error("Fetch error:", error);
    }
}

// AIからのメッセージを吹き出しで追記する（保存ボタン付き）
function appendAiMessage(text) {
    const chatBox = document.getElementById("chat-box");
    const aiMessageHtml = marked.parse(text);

    const container = document.createElement('div');
    container.className = 'message-container ai-message-container';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = aiMessageHtml;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-to-note-btn';
    saveBtn.textContent = 'ノートに保存';
    saveBtn.addEventListener('click', () => saveToNote(text));
    
    bubble.appendChild(saveBtn);
    container.appendChild(bubble);
    chatBox.appendChild(container);
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ユーザーのメッセージを吹き出しで追記する
function appendUserMessage(text) {
    const chatBox = document.getElementById("chat-box");
    const container = document.createElement('div');
    container.className = 'message-container user-message-container';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    container.appendChild(bubble);
    chatBox.appendChild(container);
    chatBox.scrollTop = chatBox.scrollHeight;
}


// --- 以下、学習ノート関連の関数 ---

// ▼▼▼【ここを修正】タイトルを入力して保存する関数 ▼▼▼
function saveToNote(content) {
  if (!content) return;

  // promptダイアログでユーザーにタイトルを入力させる
  const title = prompt("このノートのタイトルを入力してください:", "無題のノート");

  // ユーザーがキャンセルボタンを押した場合は何もしない
  if (title === null) {
    return;
  }
  
  // 保存するノートオブジェクトを作成
  const note = {
    title: title || "無題のノート", // 入力が空ならデフォルトタイトルを設定
    content: content
  };

  savedAnswers.push(note);
  localStorage.setItem("savedAnswers", JSON.stringify(savedAnswers));
  alert("学習ノートに保存しました！");
}


// ▼▼▼【ここを修正】タイトル付きでノートを表示する関数 ▼▼▼
function renderSavedAnswers() {
  const list = document.getElementById("saved-answers");
  list.innerHTML = "";
  savedAnswers.forEach((note, index) => {
    const li = document.createElement("li");

    let noteHtml = '';
    // 保存データの形式をチェック（旧バージョンとの互換性のため）
    if (typeof note === 'object' && note.title !== undefined) {
      // 新しい形式（タイトル付き）
      noteHtml = `
        <div>
          <strong style="font-size: 1.1em;">${note.title}</strong>
          <hr style="margin: 8px 0;">
          ${marked.parse(note.content)}
        </div>
      `;
    } else {
      // 古い形式（タイトルなし）
      noteHtml = `<div>${marked.parse(note)}</div>`;
    }

    li.innerHTML = noteHtml + `<button class="delete-btn" onclick="deleteAnswer(${index})">削除</button>`;
    list.appendChild(li);
  });
}

function deleteAnswer(index) {
  savedAnswers.splice(index, 1);
  localStorage.setItem("savedAnswers", JSON.stringify(savedAnswers));
  renderSavedAnswers();
}

function clearAll() {
  if (confirm("学習ノートをすべて消去しますか？")) {
    savedAnswers = [];
    localStorage.removeItem("savedAnswers");
    renderSavedAnswers();
  }
}