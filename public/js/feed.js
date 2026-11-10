import { api, $, chrome, postHtml, bindPosts, store } from './common.js';
chrome('feed');
const feed = $('#feed'); const more = $('#more'); const posts = new Map();
let before = 0;
bindPosts(feed, posts);

async function load() {
  more.disabled = true;
  const r = await api('posts' + (before ? `?before=${before}` : ''));
  more.disabled = false;
  if (r.error) { feed.insertAdjacentHTML('beforeend', `<p class="empty">${r.error}</p>`); return; }
  const hidden = store.reported();
  const list = (r.posts || []).filter((p) => !hidden.includes(p.id));
  if (!before && !list.length && r.samples) {
    feed.innerHTML = '<p class="hint">아직 올라온 글이 없어요. 아래는 이렇게 보인다는 예시예요.</p>';
    for (const p of r.samples) { posts.set(p.id, p); feed.insertAdjacentHTML('beforeend', postHtml(p)); }
    return;
  }
  for (const p of list) { posts.set(p.id, p); feed.insertAdjacentHTML('beforeend', postHtml(p)); }
  if (r.posts?.length) before = r.posts[r.posts.length - 1].at;
  more.hidden = !r.more;
}
more.onclick = load;
load();
