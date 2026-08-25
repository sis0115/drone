import { postRoute } from '../_lib/route';
import { createProfile } from '../_lib/service';
import { fail } from '../_lib/http';

export default postRoute(async (body) => {
  const schemaVersion = Number(body.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return fail(400, 'bad_request', 'schemaVersion 이 필요합니다');
  }
  return createProfile(body.data ?? {}, schemaVersion);
});
