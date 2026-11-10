import { api, $, chrome, postHtml, bindPosts, num } from './common.js';
chrome('');
const id = new URLSearchParams(location.search).get('id') || '';
const box = $('#one'); const posts = new Map();
bindPosts(box, posts);
document.addEventListener('post-deleted', () => { location.href = '/'; });
const r = await api('posts/' + encodeURIComponent(id));
if (r.error || !r.post) box.innerHTML = `<p class="empty">${r.error || '글을 찾을 수 없어요.'}</p>`;
else {
  posts.set(r.post.id, r.post); box.innerHTML = postHtml(r.post);
  if (r.answeredToday > 1) $('#today').textContent = `이 문장은 오늘 ${num(r.answeredToday)}명에게 답했어요.`;
}
