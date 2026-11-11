import { json, readBody, postView } from '../../_lib/util.js';

// 관리자용: 받은 의견 보기, 신고로 가려진 글 보기·되살리기, 글 지우기(기기를 잃은 사람의 삭제 요청 등)
// ADMIN_KEY(비밀 값)가 맞아야 한다.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json({ error: '열쇠가 맞지 않아요.' }, 403);
  const DB = env.DB;

  if (b.act === 'feedback') {
    const { results } = await DB.prepare('SELECT id, text, created_at FROM feedback ORDER BY id DESC LIMIT 100').all();
    return json({ feedback: results });
  }
  if (b.act === 'feedback-done') {
    await DB.prepare('DELETE FROM feedback WHERE id = ?').bind(Number(b.id)).run();
    return json({ ok: true });
  }
  if (b.act === 'reported') {
    const { results } = await DB.prepare('SELECT * FROM posts WHERE reports > 0 ORDER BY hidden DESC, reports DESC, created_at DESC LIMIT 100').all();
    return json({ posts: results.map((r) => ({ ...postView(r), reports: r.reports, hidden: !!r.hidden })) });
  }
  const id = String(b.id || '').trim().replace(/^.*[?&]id=/, '');
  if (!id) return json({ error: '글 주소나 id를 넣어 주세요.' }, 400);
  if (b.act === 'find') {
    const r = await DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
    return r ? json({ post: { ...postView(r), reports: r.reports, hidden: !!r.hidden } }) : json({ error: '그런 글이 없어요.' }, 404);
  }
  if (b.act === 'restore') {
    await DB.batch([
      DB.prepare('UPDATE posts SET hidden = 0, reports = 0 WHERE id = ?').bind(id),
      DB.prepare('DELETE FROM reports WHERE post_id = ?').bind(id),
    ]);
    return json({ ok: true });
  }
  if (b.act === 'hide') {
    await DB.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (b.act === 'delete') {
    await DB.batch([
      DB.prepare('DELETE FROM posts WHERE id = ?').bind(id),
      DB.prepare('DELETE FROM votes WHERE post_id = ?').bind(id),
      DB.prepare('DELETE FROM reports WHERE post_id = ?').bind(id),
    ]);
    return json({ ok: true });
  }
  return json({ error: '알 수 없는 요청이에요.' }, 400);
}
