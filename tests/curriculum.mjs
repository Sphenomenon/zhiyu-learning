import assert from 'node:assert/strict'

export async function checkCurriculum(t, call, base, admin, learner, stranger) {
  const courseId = 'reader-fixture'
  const adminOptions = { cookie: admin.cookie }
  const learnerOptions = { cookie: learner.cookie }
  const editor = `/admin/courses/${courseId}/curriculum`
  const reader = `/courses/${courseId}/curriculum`
  const outline = `/courses/${courseId}/outline`
  const original = (await call('/admin/content', adminOptions)).data.items.find(item => item.kind === 'course')
  assert.equal((await call(`/admin/content/course/${courseId}`, { ...adminOptions, method: 'PUT', data: { draft: { ...original.draft, title: '章节测试课程' }, revision: 0, action: 'publish' } })).status, 200)
  const changeAccess = action => call('/admin/entitlements', { ...adminOptions, data: { requestId: crypto.randomUUID(), userId: learner.me.user.id, courseId, action, reason: 'Curriculum integration fixture' } })
  const content = { chapters: [{ id: 'chapter-one', title: '第一章', titleEn: 'Chapter one', lessons: [
    { id: 'lesson-text', title: '图文小节', blocks: [{ id: 'paragraph-one', type: 'paragraph', text: 'PAID-LESSON-TEXT <script>alert(1)</script>', textEn: 'PRIVATE ENGLISH TEXT' }], video: null },
    { id: 'lesson-video', title: '影片小节', blocks: [{ id: 'heading-two', type: 'heading', text: '影片练习说明' }], video: { url: 'https://pan.baidu.com/s/TESTLESSONVIDEO?pwd=Ab12', extractionCode: '', note: 'Follow the demonstration' } },
  ] }] }
  let revision = 0
  const save = (draft, action = 'draft', version = revision) => call(editor, { ...adminOptions, method: 'PUT', data: { draft, action, revision: version } })
  let imageUrl
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
  const upload = (bytes, cookie, type = 'image/png', origin = base) => fetch(`${base}/api/admin/courses/${courseId}/images`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': type }, body: bytes })
  await t.test('course curriculum is private and drafts allow incomplete authoring', async () => {
    assert.equal((await call(editor)).status, 401)
    assert.equal((await call(editor, learnerOptions)).status, 403)
    assert.equal((await call(reader, adminOptions)).status, 403)
    assert.equal((await call(editor, adminOptions)).data.item.revision, 0)
    const draft = await save({ chapters: [{ id: 'new-chapter', title: '', lessons: [] }] })
    assert.equal(draft.status, 200); revision = draft.data.item.revision
    assert.equal((await call(outline)).data.chapters.length, 0)
    assert.equal((await call(reader)).status, 401)
    assert.equal((await call(reader, learnerOptions)).status, 403)
    assert.equal((await changeAccess('grant')).status, 200)
    assert.equal((await call(reader, learnerOptions)).data.curriculum, null)
    assert.equal((await save({ chapters: [{ id: 'empty', title: 'Empty', lessons: [] }] }, 'publish')).data.error.code, 'LESSON_EMPTY')
  })
  await t.test('lesson image uploads enforce role, size, format and draft visibility', async () => {
    assert.equal((await upload(png, stranger.cookie)).status, 403)
    assert.equal((await upload(png, admin.cookie, 'image/png', 'https://attacker.example')).status, 403)
    assert.equal((await upload('<svg onload="alert(1)"/>', admin.cookie, 'image/svg+xml')).status, 400)
    assert.equal((await upload(new Uint8Array(5 * 1024 * 1024 + 1), admin.cookie)).status, 413)
    const result = await upload(png, admin.cookie)
    assert.equal(result.status, 201)
    imageUrl = (await result.json()).url
    assert.match(imageUrl, new RegExp(`^/api/courses/${courseId}/images/[a-f0-9-]{36}$`))
    assert.equal((await fetch(base + imageUrl)).status, 401)
    assert.equal((await fetch(base + imageUrl, { headers: { Cookie: stranger.cookie } })).status, 403)
    assert.equal((await fetch(base + imageUrl, { headers: { Cookie: learner.cookie } })).status, 404)
    const preview = await fetch(base + imageUrl, { headers: { Cookie: admin.cookie } })
    assert.equal(preview.status, 200)
    assert.equal(preview.headers.get('content-type'), 'image/png')
    assert.equal(preview.headers.get('cache-control'), 'no-store')
    assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), png)
    content.chapters[0].lessons[0].blocks.push({ id: 'image-one', type: 'image', url: imageUrl, caption: 'PRIVATE IMAGE CAPTION' })
  })
  await t.test('publishing exposes only the outline publicly and full lessons to enrolled learners', async () => {
    const published = await save(content, 'publish')
    assert.equal(published.status, 200); revision = published.data.item.revision
    const publicOutline = await call(outline)
    assert.equal(publicOutline.data.chapters[0].lessons.length, 2)
    assert.equal(publicOutline.data.chapters[0].lessons[0].hasVideo, false)
    assert.equal(publicOutline.data.chapters[0].lessons[1].hasVideo, true)
    const publicStrings = JSON.stringify([publicOutline.data, (await call('/courses')).data])
    for (const secret of ['PAID-LESSON-TEXT', 'PRIVATE ENGLISH', 'PRIVATE IMAGE CAPTION', 'TESTLESSONVIDEO', 'Ab12', imageUrl]) assert.equal(publicStrings.includes(secret), false, secret)
    assert.equal((await call('/courses')).data.items.find(item => item.id === courseId).lessons, 2)
    const reading = await call(reader, learnerOptions)
    assert.equal(reading.data.curriculum.chapters[0].lessons[0].video, null)
    assert.equal(reading.data.curriculum.chapters[0].lessons[1].video.extractionCode, 'Ab12')
    assert.equal(reading.headers.get('cache-control'), 'no-store')
    const image = await fetch(base + imageUrl, { headers: { Cookie: learner.cookie } })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('cache-control'), 'no-store')
  })
  await t.test('lesson validation rejects duplicate IDs, cross-course images and unsafe links', async () => {
    const cases = [
      draft => { draft.chapters[0].lessons[1].id = 'lesson-text' },
      draft => { draft.chapters[0].lessons[1].video.url = 'javascript:alert(1)' },
      draft => { draft.chapters[0].lessons[1].video.url = 'https://pan.baidu.com.evil.test/s/fake' },
      draft => { draft.chapters[0].lessons[0].blocks[1].url = '/api/courses/another-course/images/00000000-0000-4000-8000-000000000000' },
      draft => { draft.chapters[0].lessons[0].blocks[1].url = 'data:image/svg+xml,<svg/>' },
      draft => { draft.chapters[0].lessons[0].blocks = [{ id: 'html', type: 'html', text: '<script/>' }] },
    ]
    for (const mutate of cases) { const invalid = structuredClone(content); mutate(invalid); assert.equal((await save(invalid, 'publish')).status, 400) }
    assert.equal((await save({ chapters: [], padding: 'a'.repeat(1_000_000) })).status, 413)
  })
  await t.test('draft edits, concurrent revisions, video removal and reordering are applied on publish', async () => {
    const changed = structuredClone(content)
    changed.chapters[0].lessons[0].blocks[0].text = 'UPDATED-PRIVATE-DRAFT'
    changed.chapters[0].lessons[1].video = null
    changed.chapters[0].lessons.reverse()
    let response = await save(changed)
    assert.equal(response.status, 200); revision = response.data.item.revision
    assert.equal((await call(reader, learnerOptions)).data.curriculum.chapters[0].lessons[1].video.extractionCode, 'Ab12')
    assert.equal((await save(changed, 'publish', revision - 1)).status, 409)
    const concurrent = await Promise.all([save(changed), save(changed)])
    assert.deepEqual(concurrent.map(item => item.status).sort(), [200, 409])
    revision = concurrent.find(item => item.status === 200).data.item.revision
    response = await save(changed, 'publish')
    assert.equal(response.status, 200); revision = response.data.item.revision
    const read = (await call(reader, learnerOptions)).data.curriculum
    assert.deepEqual(read.chapters[0].lessons.map(item => item.id), ['lesson-video', 'lesson-text'])
    assert.equal(read.chapters[0].lessons[0].video, null)
    assert.equal(read.chapters[0].lessons[1].blocks[0].text, 'UPDATED-PRIVATE-DRAFT')
  })
  await t.test('revocation and unpublishing block lesson text and uploaded images', async () => {
    await changeAccess('revoke')
    assert.equal((await call(reader, learnerOptions)).status, 403)
    assert.equal((await fetch(base + imageUrl, { headers: { Cookie: learner.cookie } })).status, 403)
    await changeAccess('grant')
    const hidden = await save(content, 'unpublish')
    assert.equal(hidden.status, 200); revision = hidden.data.item.revision
    assert.equal((await call(reader, learnerOptions)).data.curriculum, null)
    assert.deepEqual((await call(outline)).data.chapters, [])
    assert.equal((await fetch(base + imageUrl, { headers: { Cookie: learner.cookie } })).status, 404)
    assert.ok((await call(editor, adminOptions)).data.item.draft.chapters.length)
    assert.equal((await save(content, 'publish')).status, 200)
  })
}
