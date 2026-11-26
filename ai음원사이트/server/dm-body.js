import {fail} from './db.js';
import {dmBodyStats} from '../shared/chat-sticker-body.js';

export function assertDmBody(body){
 const {warning}=dmBodyStats(body);
 if(warning)fail(400,warning);
}
