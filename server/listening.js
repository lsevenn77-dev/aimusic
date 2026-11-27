import {defaultListeningTemplate,isListeningTemplate} from '../shared/listening.js';
import {fail,str} from './db.js';

export function listeningTemplateInput(body){
 if(!Object.hasOwn(body,'listening_template'))return undefined;
 if(!isListeningTemplate(body.listening_template))fail(400,'감상 화면 템플릿을 다시 선택해 주세요.');
 return body.listening_template;
}

export function initialListeningTemplate(source){
 return source?.listening_template??defaultListeningTemplate;
}

export function listeningDescriptionInput(body){
 return Object.hasOwn(body,'listening_description')?str(body.listening_description,1000,false):undefined;
}
