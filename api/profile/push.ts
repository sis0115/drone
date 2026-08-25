import { handlePost } from '../_lib/route';
import { pushProfile } from '../_lib/service';
import { fail, isNonEmptyString } from '../_lib/http';

export async function POST(request: Request): Promise<Response> {
  return handlePost(request, async (body) => {
    if (!isNonEmptyString(body.secret)) return fail(400, 'bad_request', 'secret 이 필요합니다');
    const baseRev = Number(body.baseRev);
    const schemaVersion = Number(body.schemaVersion);
    if (!Number.isInteger(baseRev) || baseRev < 0) {
      return fail(400, 'bad_request', 'baseRev 가 필요합니다');
    }
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      return fail(400, 'bad_request', 'schemaVersion 이 필요합니다');
    }
    return pushProfile(body.secret, baseRev, body.data ?? {}, schemaVersion);
  });
}
