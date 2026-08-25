import { postRoute } from '../_lib/route';
import { claimLink } from '../_lib/service';
import { clientIp, fail, isNonEmptyString } from '../_lib/http';

export default postRoute(async (body, req) => {
  if (!isNonEmptyString(body.code)) return fail(400, 'bad_request', 'code 가 필요합니다');
  return claimLink(body.code, clientIp(req.headers));
});
