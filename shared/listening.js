export {dubbingRecordingWindows} from './dubbing-recording.js';

export const defaultListeningTemplate = 'cover';

export const listeningTemplates = Object.freeze([
 {id:defaultListeningTemplate,label:'기본'},
 {id:'turntable-v1',label:'턴테이블'},
 {id:'projector-v1',label:'영사기'},
]);

export const isListeningTemplate = value => listeningTemplates.some(template=>template.id===value);
export const displayListeningTemplate = value => isListeningTemplate(value)?value:defaultListeningTemplate;
