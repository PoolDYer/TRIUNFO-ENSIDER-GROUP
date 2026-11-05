import {test} from "node:test";
import assert from "node:assert/strict";
import {productionRedirects} from "../lib/canonical-redirects";
import {checkOrigin} from "../lib/auth";

test("Los dominios secundarios de producción llevan al dominio público y conservan la ruta",()=>{
 const [rule]=productionRedirects("https://triunfo-ensider-group.vercel.app","production");
 assert.equal(rule.destination,"https://triunfo-ensider-group.vercel.app/:path*");
 const primary=new RegExp('^'+rule.missing[0].value+'$');
 assert.equal(primary.test('triunfo-ensider-group.vercel.app'),true);
 assert.equal(primary.test('triunfo-ensider-group-random-pooldyers-projects.vercel.app'),false);
 assert.equal(primary.test('triunfo-ensider-groupXvercelXapp'),false);
 assert.deepEqual(productionRedirects("https://triunfo-ensider-group.vercel.app","preview"),[]);
 assert.deepEqual(productionRedirects("https://triunfo-ensider-group.vercel.app",undefined),[]);
 assert.throws(()=>productionRedirects('https://example.com/otra-ruta','production'),/APP_URL/);
});

test("La redirección no habilita solicitudes de otros orígenes",()=>{
 const previous=process.env.APP_URL;
 process.env.APP_URL='https://triunfo-ensider-group.vercel.app';
 try{
  assert.doesNotThrow(()=>checkOrigin(new Request('https://triunfo-ensider-group.vercel.app/api/auth',{headers:{Origin:'https://triunfo-ensider-group.vercel.app'}})));
  assert.throws(()=>checkOrigin(new Request('https://triunfo-ensider-group.vercel.app/api/auth',{headers:{Origin:'https://otro.example'}})),/Origen/);
 }finally{if(previous===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous;}
});
