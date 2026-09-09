import { handleRequest } from '../../server/router.ts'
import type { Env } from '../../server/http.ts'

export const onRequest: PagesFunction<Env> = ({ request, env }) => handleRequest(request, env)
