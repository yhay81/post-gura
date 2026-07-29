# ポスト蔵

Xから取得した公式アーカイブを端末内だけで読み、過去の投稿を日付・種類・語句で探すWebアプリです。

## Product boundary

- アーカイブのZIPはブラウザ内で処理し、サーバーへ送信しない
- 投稿、いいね、ブックマークとして判別できるファイルだけを読む
- DM、メディア、連絡先、広告データなどは読まない
- アカウント登録やX API接続は行わない
- 明示操作で保存したローカルコピーだけをIndexedDBへ置く
- 匿名の操作イベントだけをD1に45日保存する

## Development

Node.js 24 と npm 11 を使用します。

```powershell
npm install
npm run check
npm test
npm run build
```

ローカル実行は `npm run dev`、Cloudflareへの公開は `npm run deploy` です。

## Public URL

<https://post-gura.yhay81.com>
