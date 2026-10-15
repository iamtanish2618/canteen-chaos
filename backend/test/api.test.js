const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.LATENCY_MS='0';
// Keep availability deterministic without changing application clock code.
const NativeDate=Date;
const fixed=new NativeDate(2026,9,15,18,0).getTime();
global.Date=class extends NativeDate {constructor(...a){super(...(a.length?a:[fixed]));} static now(){return fixed;}};
const store=require('../store');
const data={menu:[{id:1,name:'Samosa',stock:2,slot:'allday',price:100,veg:true,tags:[],category:'Snacks',rating:4,prepMinutes:5}],coupons:[{code:'ONE',usesLeft:1,expiresAt:'2027-12-31T00:00:00Z',minOrder:0,type:'flat',value:10,maxDiscount:10}],orders:[],members:[],ratings:[]};
store.read=n=>structuredClone(data[n]||[]);
store.write=(n,d)=>{data[n]=structuredClone(d);return d;};
store.update=(n,f)=>store.write(n,f(store.read(n)));
store.readMenu=()=>store.read('menu');store.writeMenu=d=>store.write('menu',d);
const {app}=require('../server');
test('API: stock race, one-use coupon, cancellation and replay',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 const base=`http://localhost:${server.address().port}`;
 async function request(path,body,method='POST',key){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try {
  assert.equal((await request('/api/orders',{items:[{dishId:1,qty:5}]})).status,400);
  assert.equal(data.menu[0].stock,2);
  const order=await request('/api/orders',{items:[{dishId:1,qty:1}],couponCode:'ONE'},'POST','first');
  assert.equal(order.status,201);assert.equal(data.coupons[0].usesLeft,0);
  assert.equal((await request('/api/orders',{items:[{dishId:1,qty:1}],couponCode:'ONE'})).status,400);
  assert.equal((await request('/api/orders',{items:[{dishId:1,qty:1}]},'POST','first')).status,200);
  assert.equal(data.menu[0].stock,1);
  const race=await Promise.all([request('/api/orders',{items:[{dishId:1,qty:1}]}),request('/api/orders',{items:[{dishId:1,qty:1}]})]);
  assert.equal(race.filter(r=>r.status===201).length,1);assert.equal(data.menu[0].stock,0);
  assert.equal((await request(`/api/orders/${order.body.token}/status`,{status:'cancelled'},'PATCH')).status,200);
  assert.equal(data.menu[0].stock,1);assert.equal(data.coupons[0].usesLeft,1);
  assert.equal((await request(`/api/orders/${order.body.token}/status`,{status:'cancelled'},'PATCH')).status,409);
  assert.equal(data.menu[0].stock,1);assert.equal(data.coupons[0].usesLeft,1);
 } finally {await new Promise(r=>server.close(r));global.Date=NativeDate;}
});
