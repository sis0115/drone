import { handlePost } from '../_lib/route';
import { createLink } from '../_lib/service';
import { fail, isNonEmptyString } from '../_lib/http';

export async function POST(request: Request): Promise<Response> {
  return handlePost(request, async (body) => {
    if (!isNonEmptyString(body.secret)) return fail(400, 'bad_request', 'secret 이 필요합니다');
    return createLink(body.secret);
  });
}
