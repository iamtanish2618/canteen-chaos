const {test}=require('node:test');
const assert=require('node:assert/strict');
const v=require('../logic/validation');
const p=require('../logic/pricing');
const s=require('../logic/search');
const status=require('../logic/status');
const now=new Date(2026,9,15,18,0);
const menu=[{id:1,name:'Samosa',stock:2,slot:'allday',price:20,disabled:false}];
test('CC06 rejects excess stock in validation and reservation without mutation',()=>{
 assert.equal(v.validateOrder({items:[{dishId:1,qty:5}]},menu,{now}).valid,false);
 assert.equal(v.reserveStock([{dishId:1,qty:5}],menu).ok,false);
 assert.equal(v.reserveStock([{dishId:1,qty:2}],menu).menu[0].stock,0);
 assert.equal(v.reserveStock([{dishId:1,qty:1},{dishId:1,qty:2}],menu).ok,false);
 for(const qty of [-1,0,1.5,'2',NaN]) assert.equal(v.reserveStock([{dishId:1,qty}],menu).ok,false);
 assert.equal(menu[0].stock,2);
});
test('CC07 cancellation restores reserved stock',()=>{
 const reserved=v.reserveStock([{dishId:1,qty:2}],menu);
 assert.deepEqual(v.releaseStock([{dishId:1,qty:2}],reserved.menu),menu);
});
test('CC08 expiry boundary is exclusive, malformed expiry is rejected',()=>{
 const coupon={code:'TEST',usesLeft:1,minOrder:0,type:'flat',value:10,maxDiscount:10,expiresAt:now.toISOString()};
 const check=(c,at=now)=>p.applyCoupon('test',[{lineTotal:100}], [c],{now:at});
 assert.equal(check(coupon).valid,false);
 assert.equal(check(coupon,new Date(+now-1)).valid,true);
 assert.equal(check({...coupon,expiresAt:'invalid'}).valid,false);
 assert.equal(p.applyCoupon('FRESHERS24',[{lineTotal:150}],require('../data/coupons.json'),{now}).valid,false);
});
test('CC09 paging returns disjoint slices and correct metadata',()=>{
 const list=Array.from({length:13},(_,i)=>i);
 assert.deepEqual(s.paginate(list,1,5).items,[0,1,2,3,4]);
 assert.deepEqual(s.paginate(list,2,5).items,[5,6,7,8,9]);
 assert.deepEqual(s.paginate(list,3,5).items,[10,11,12]);
 assert.equal(s.paginate(list,3,5).hasMore,false);
 assert.deepEqual(s.paginate(list,4,5).items,[]);
});
test('CC10 numeric price direction preserves input',()=>{
 const list=[{price:100},{price:20},{price:9}];
 assert.deepEqual(s.sortDishes(list,'price-asc').map(d=>d.price),[9,20,100]);
 assert.deepEqual(s.sortDishes(list,'price-desc').map(d=>d.price),[100,20,9]);
 assert.equal(list[0].price,100);
});
test('EX01 ready can be picked, picked refunded, terminal states immutable',()=>{
 assert.equal(status.canTransition('ready','picked').ok,true);
 assert.equal(status.canTransition('picked','refunded').ok,true);
 for(const from of ['cancelled','refunded']) assert.equal(status.canTransition(from,'placed').ok,false);
 assert.equal(status.canTransition('ready','cancelled').ok,false);
 assert.equal(status.canTransition('placed','picked').ok,false);
});
