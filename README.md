# ManabiChat ｜ 学び特化AIチャットアプリ

ManabiChat は、**Chappy（ChatGPT API）× Streamlit** を使って開発した、  
あらゆる分野の学習者向け **AIチャットアプリ** です。

勉強内容はプログラミングに限らず、  
英語・資格勉強・大学の講義・レポート・一般知識まで幅広く対応します。

---

## ✨ Features（機能）

- 💬 **Chappy（ChatGPT API）による自然で柔らかい応答**
- 📚 プログラミング / 英語 / 資格 / レポート作成など幅広い学習をサポート
- 🧠 **「初心者向けにやさしく説明」** に特化したプロンプト最適化
- 🔁 **会話履歴の保持（Streamlit session_state使用）**
- 🔐 `.env` による APIキーの安全管理
- 📱 **スマホでも使いやすい軽量UI**

---

## 🧰 Tech Stack（使用技術）

- **Python 3.10+**
- **Streamlit**
- **OpenAI (ChatGPT) API / Chappy API**
- python-dotenv（環境変数管理）

---

## 🚀 How to Run（ローカルで動かす方法）

1. **Clone**
```bash
git clone https://github.com/sota-utsumi/ManabiChat.git
cd ManabiChat
```

2. **仮想環境を作る**
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

3. **必要ライブラリをインストール**
```bash
pip install -r requirements.txt
```

4. **.env を作成してAPIキーを登録**
```
CHAPPY_API_KEY=あなたのAPIキー
```

5. **アプリを起動**
```bash
streamlit run app.py
```

---

## 📸 UIイメージ（任意）
※ スクショを載せる場合はここに貼る  
（例：チャット画面、レスポンス例）

---

## 🧑‍🎓 Background / Motivation（背景）

- どんな分野の学習でも **「わかりやすく教えてくれる相手」** がほしい  
- プログラミング以外でも、英語・資格・大学講義の復習など幅広く使いたい  
- いつでもスマホから相談できる  
- Streamlitで軽量に作れて、API差し替えにも強い学習アプリが欲しかった  

そんな思いから、**Chappy（ChatGPT API）× Streamlit** で開発した総合学習支援ツール。

---

## 🔧 Future Improvements（改善案）

- [ ] 回答の「要点まとめ」機能  
- [ ] チャット履歴の保存（JSON/Markdown）  
- [ ] 学習ジャンルごとのプリセット（英語 / 資格 / プログラミングなど）  
- [ ] UIテーマの切り替え  

---

## 📄 License
MIT License

