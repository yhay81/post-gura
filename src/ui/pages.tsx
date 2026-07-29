import { product } from "../config/product";
import { Layout } from "./layout";

function ArchiveStage() {
  return (
    <section
      aria-label="アーカイブZIPが年別の引き出しに整理され、投稿を検索できるイメージ"
      class="archive-stage"
    >
      <div aria-hidden="true" class="archive-crate">
        <span class="crate-seal">LOCAL</span>
        <i class="crate-lid"></i>
        <b>archive.zip</b>
        <span class="crate-files">
          <i>POST</i>
          <i>LIKE</i>
          <i>SAVE</i>
        </span>
      </div>
      <div aria-hidden="true" class="transfer-rail">
        <i></i>
        <i></i>
        <i></i>
        <span>端末内</span>
      </div>
      <div aria-hidden="true" class="year-cabinet">
        <span class="cabinet-label">YEARS</span>
        <div>
          <i>2012</i>
          <b></b>
        </div>
        <div>
          <i>2018</i>
          <b></b>
        </div>
        <div class="active">
          <i>2024</i>
          <b></b>
        </div>
      </div>
      <div aria-hidden="true" class="search-aperture">
        <i></i>
        <b></b>
      </div>
      <div aria-hidden="true" class="result-slips">
        <article>
          <time>2024.06.12</time>
          <span></span>
          <span></span>
        </article>
        <article>
          <time>2018.10.03</time>
          <span></span>
          <span></span>
        </article>
        <article>
          <time>2012.04.21</time>
          <span></span>
          <span></span>
        </article>
      </div>
    </section>
  );
}

function ImportPanel() {
  return (
    <section class="import-panel" id="import-panel">
      <header>
        <span class="eyebrow">X ARCHIVE / LOCAL SEARCH</span>
        <h1>{product.headline}</h1>
        <p>
          XからダウンロードしたZIPを選択。投稿・いいね・ブックマークだけを読み、語句と日付で絞れます。
        </p>
      </header>
      <label class="file-drop" id="file-drop">
        <input
          accept=".zip,.js,.json,application/zip,application/json,text/javascript"
          id="archive-files"
          multiple
          type="file"
        />
        <span aria-hidden="true" class="drop-vault">
          <i></i>
          <b>ZIP</b>
        </span>
        <strong>アーカイブを選ぶ</strong>
        <small>ZIP、または展開済みの tweets.js など</small>
      </label>
      <div class="local-boundary">
        <span>
          <i aria-hidden="true"></i>
          アップロードしない
        </span>
        <span>
          <i aria-hidden="true"></i>
          DMを読まない
        </span>
        <span>
          <i aria-hidden="true"></i>
          ログイン不要
        </span>
      </div>
      <button class="saved-copy" hidden id="open-saved" type="button">
        <span aria-hidden="true" class="saved-icon"></span>
        <span>
          <strong>この端末の保存分を開く</strong>
          <small id="saved-summary"></small>
        </span>
      </button>
      <p aria-live="polite" class="action-status" id="import-status"></p>
    </section>
  );
}

function SearchWorkspace() {
  return (
    <section class="search-workspace" hidden id="search-workspace">
      <header class="archive-summary">
        <div>
          <span class="eyebrow">OPEN ARCHIVE</span>
          <h2 id="archive-name">アーカイブ</h2>
          <p id="archive-range"></p>
        </div>
        <dl>
          <div>
            <dt>投稿</dt>
            <dd id="post-count">0</dd>
          </div>
          <div>
            <dt>いいね</dt>
            <dd id="like-count">0</dd>
          </div>
          <div>
            <dt>保存</dt>
            <dd id="bookmark-count">0</dd>
          </div>
        </dl>
      </header>

      <div class="archive-tools">
        <div class="search-box">
          <span aria-hidden="true"></span>
          <label for="search-query">投稿を探す</label>
          <input
            autocomplete="off"
            id="search-query"
            placeholder="覚えている語句を入力"
            type="search"
          />
          <kbd>⌘ K</kbd>
        </div>
        <div class="filter-row">
          <label>
            <span>種類</span>
            <select id="kind-filter">
              <option value="all">すべて</option>
              <option value="post">投稿</option>
              <option value="reply">返信</option>
              <option value="repost">リポスト</option>
              <option value="like">いいね</option>
              <option value="bookmark">ブックマーク</option>
              <option value="note">長文投稿</option>
            </select>
          </label>
          <label>
            <span>開始日</span>
            <input id="date-from" type="date" />
          </label>
          <label>
            <span>終了日</span>
            <input id="date-to" type="date" />
          </label>
          <label>
            <span>並び順</span>
            <select id="sort-order">
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
            </select>
          </label>
          <button class="filter-clear" id="clear-filters" type="button">
            条件を戻す
          </button>
        </div>
      </div>

      <section aria-label="年ごとの投稿量" class="year-map">
        <header>
          <span>年ごとの引き出し</span>
          <small>選ぶとその年だけ表示</small>
        </header>
        <div class="year-bars" id="year-bars"></div>
      </section>

      <section class="results-panel">
        <header>
          <div>
            <span class="eyebrow">FOUND SLIPS</span>
            <h2>
              <strong id="result-count">0</strong> 件
            </h2>
          </div>
          <div class="export-actions">
            <button data-export="csv" type="button">
              CSV
            </button>
            <button data-export="json" type="button">
              JSON
            </button>
            <button data-export="print" type="button">
              印刷
            </button>
          </div>
        </header>
        <div aria-live="polite" class="result-list" id="result-list"></div>
        <button class="load-more" hidden id="load-more" type="button">
          続きを見る
        </button>
      </section>

      <section class="local-actions">
        <div>
          <strong>この端末に作業用コピーを残す</strong>
          <p>選んだときだけ、整理済みの投稿をこのブラウザへ保存します。</p>
        </div>
        <div>
          <button class="button" id="save-local" type="button">
            端末に保存
          </button>
          <button class="button danger" id="clear-archive" type="button">
            閉じて消す
          </button>
        </div>
        <p aria-live="polite" class="action-status" id="workspace-status"></p>
      </section>
    </section>
  );
}

export function HomePage() {
  return (
    <Layout>
      <ArchiveStage />
      <section class="workspace-shell" id="workspace">
        <ImportPanel />
        <SearchWorkspace />
      </section>
      <section aria-label="対応するアーカイブデータ" class="support-strip">
        <span>POSTS</span>
        <span>LIKES</span>
        <span>BOOKMARKS</span>
        <span>NOTE POSTS</span>
        <span class="muted">DM / MEDIA SKIPPED</span>
      </section>
      <script src="/archive-core.js?v=1" type="module"></script>
      <script src="/app.js?v=1" type="module"></script>
    </Layout>
  );
}

export function GuidePage() {
  return (
    <Layout canonical={`${product.url}/guide`} title={`使い方 | ${product.name}`}>
      <article class="guide-board">
        <header>
          <span class="eyebrow">THREE DRAWERS</span>
          <h1>ZIPを選び、絞り、必要な分だけ持ち出す。</h1>
        </header>
        <ol class="guide-steps">
          <li>
            <span aria-hidden="true" class="step-icon zip"></span>
            <div>
              <small>01</small>
              <strong>Xの公式アーカイブを選ぶ</strong>
              <p>
                アーカイブ一式のZIPをそのまま選べます。展開済みなら tweets.js、like.js、bookmark.js
                も選べます。
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true" class="step-icon lens"></span>
            <div>
              <small>02</small>
              <strong>語句・日付・種類で絞る</strong>
              <p>空白で区切った語句はすべて含む投稿を探します。年の引き出しからも絞れます。</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true" class="step-icon sheet"></span>
            <div>
              <small>03</small>
              <strong>結果だけを書き出す</strong>
              <p>表示中の結果をCSVかJSONに保存できます。表計算ソフト向けの文字列も保護します。</p>
            </div>
          </li>
        </ol>
        <section class="guide-note">
          <strong>アーカイブZIPの取得場所</strong>
          <p>
            Xの「設定とプライバシー」からアカウントのアーカイブをリクエストし、準備完了後にダウンロードします。
          </p>
          <a href="https://help.x.com/ja/managing-your-account/accessing-your-x-data">
            X公式の案内を開く
          </a>
        </section>
      </article>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout canonical={`${product.url}/privacy`} title={`プライバシー | ${product.name}`}>
      <article class="prose">
        <header>
          <span class="eyebrow">LOCAL VAULT</span>
          <h1>アーカイブは、選んだ端末から出さない。</h1>
        </header>
        <section>
          <h2>読むもの</h2>
          <p>
            ZIP内のファイル名を確認し、投稿、いいね、ブックマーク、長文投稿として判別できるファイルだけをブラウザ内で展開します。
          </p>
        </section>
        <section>
          <h2>読まないもの</h2>
          <p>
            ダイレクトメッセージ、画像・動画、連絡先、広告データ、アカウント詳細は開きません。検索語、投稿本文、期間、件数、ファイル名も送信しません。
          </p>
        </section>
        <section>
          <h2>端末への保存</h2>
          <p>
            読み込んだ投稿は通常、ページを閉じると消えます。「端末に保存」を選んだ場合だけ、このブラウザのIndexedDBへ整理済みデータを保存します。「閉じて消す」で削除できます。
          </p>
        </section>
        <section>
          <h2>利用状況</h2>
          <p>
            訪問、アーカイブを開いた、検索した、書き出したなど、操作があったかだけを匿名の端末IDと日本時間の日付に結びつけて45日保存します。自動テストは集計しません。
          </p>
        </section>
      </article>
    </Layout>
  );
}

export function NotFoundPage() {
  return (
    <Layout title={`見つかりません | ${product.name}`}>
      <section class="not-found">
        <span aria-hidden="true" class="empty-drawer"></span>
        <h1>この引き出しは空でした。</h1>
        <a class="button" href="/">
          ポスト蔵へ戻る
        </a>
      </section>
    </Layout>
  );
}
