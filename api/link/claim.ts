import { handlePost } from '../_lib/route.js';
import { claimLink } from '../_lib/service.js';
import { clientIp, fail, isNonEmptyString } from '../_lib/http.js';

export async function POST(request: Request): Promise<Response> {
  return handlePost(request, async (body, req) => {
    if (!isNonEmptyString(body.code)) return fail(400, 'bad_request', 'code 가 필요합니다');
    return claimLink(body.code, clientIp(req.headers));
  });
}
