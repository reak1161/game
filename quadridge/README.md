# QUADRIDGE

15×15 の盤面で遊ぶ、2人対戦の Web ゲームです。v0.3 ではオンライン対戦と、従来のローカル2人対戦を利用できます。

## ローカルで起動

```sh
npm install
npm run dev
```

Wrangler が表示する URL をブラウザーで開いてください。画面の変更後は `npm run build` を再実行してからページを更新してください。

## 確認

```sh
npm test
npm run deploy:check
```

オンライン対戦の通信テストは、別のターミナルで `npm run dev` を起動した状態で実行します。

```sh
npm run test:online
```

公開時は `npm run deploy` を実行します。`wrangler.jsonc` に Worker、静的アセット、Durable Objects、カスタムドメイン `quadridge.reak1161.com` の設定があります。

## 遊び方

ホームで名前を入力し、ランダム対戦またはルーム対戦を選びます。ルームは6文字のコードか招待リンクで参加できます。ローカル2人対戦は `/local` から開けます。操作と用語はゲーム内のヘルプを参照してください。
