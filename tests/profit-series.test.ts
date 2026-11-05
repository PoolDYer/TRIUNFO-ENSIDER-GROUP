import {test} from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {profitSeries} from "../lib/profit-series";
import ProfitBars from "../app/sistema/profit-bars";

test("Las barras separan ganancias y pérdidas sin confundir el acumulado con el neto",()=>{
  const daily=[{date:"2026-11-02",result:10000},{date:"2026-11-03",result:-4000},{date:"2026-11-04",result:0}];
  const data=profitSeries(daily);
  assert.equal(data.gain,10000);assert.equal(data.loss,4000);assert.equal(data.net,6000);
  assert.equal(data.points[0].loss,0);assert.equal(data.points[1].gain,0);
  assert.equal(data.pending,0);
  const pending=profitSeries([...daily,{date:"2026-11-05",result:null}]);
  assert.equal(pending.net,null);assert.equal(pending.pending,1);assert.equal(pending.points[3].gain,null);
});

test("El gráfico aparece en semanal y mensual, y no se muestra en diario",()=>{
  const daily=[{date:"2026-11-05",result:10000}];
  assert.equal(renderToStaticMarkup(createElement(ProfitBars,{daily,period:"day"})),"");
  for(const period of ["week","month"]) {
    const html=renderToStaticMarkup(createElement(ProfitBars,{daily,period}));
    assert.ok(html.includes(period==="week"?"semanal":"mensual"));
    assert.ok(html.includes("Ganancias acumuladas por día"));assert.ok(html.includes("Pérdidas acumuladas por día"));
    assert.ok(html.includes('role="img"'));
  }
});
