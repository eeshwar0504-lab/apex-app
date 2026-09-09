const enc=new TextEncoder(), dec=new TextDecoder();
function b64(buf:ArrayBuffer){let s='';const a=new Uint8Array(buf);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s)}
function unb64(s:string){const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer}
async function derive(secret:string,salt:ArrayBuffer){const base=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function wrap(dataKey:CryptoKey,secret:string){const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));const kek=await derive(secret,salt.buffer);const raw=await crypto.subtle.exportKey('raw',dataKey);const wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv},kek,raw);return {salt:b64(salt.buffer),iv:b64(iv.buffer),wrapped:b64(wrapped)}}
async function unwrap(w:any,secret:string){const kek=await derive(secret,unb64(w.salt));const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(w.iv))},kek,unb64(w.wrapped));return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function encryptBackup(json:string,passphrase:string,recoveryKeyValue?:string){
 if(passphrase.trim().length<8)throw new Error('Use a passphrase with at least 8 characters.');
 const dataKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},dataKey,enc.encode(json));
 const passWrap=await wrap(dataKey,passphrase);const recovery=recoveryKeyValue?await wrap(dataKey,recoveryKeyValue):undefined;
 return JSON.stringify({format:'APEX_ENCRYPTED_BACKUP',version:2,kdf:'PBKDF2-SHA256',iterations:150000,iv:b64(iv.buffer),ciphertext:b64(cipher),passphrase:passWrap,recovery},null,2);
}
export async function decryptBackup(raw:string,secret:string){
 const o=JSON.parse(raw);if(o?.format!=='APEX_ENCRYPTED_BACKUP')throw new Error('Not an encrypted APEX backup.');
 let key:CryptoKey|undefined;
 if(o.version===2){
   const attempts=[o.passphrase,o.recovery].filter(Boolean);for(const w of attempts){try{key=await unwrap(w,secret);break}catch{}}
   if(!key)throw new Error('Could not unlock this backup. Check the passphrase or recovery key.');
 } else {key=await derive(secret,unb64(o.salt));}
 try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(o.iv))},key,unb64(o.ciphertext));return dec.decode(plain)}catch{throw new Error('Could not unlock this backup. Check the passphrase or recovery key.')}
}
export function recoveryKey(){const a=crypto.getRandomValues(new Uint8Array(18));return b64(a.buffer).replace(/[^A-Za-z0-9]/g,'').slice(0,24).match(/.{1,4}/g)!.join('-')}
