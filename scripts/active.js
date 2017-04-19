// author: InMon Corp.
// version: 0.2
// date: 12/1/2016
// description: SDN Active Route Manager
// copyright: Copyright (c) 2015-2016 InMon Corp. ALL RIGHTS RESERVED

include(scriptdir() + '/inc/trend.js');

var trend = new Trend(300,1);
var points;

var SEP = '_SEP_';
var flow_timeout = 2;

var reflectorIP = getSystemProperty("arm.reflector.ip") || "127.0.0.1";
var reflectorIP6 = getSystemProperty("arm.reflector.ip6") || "::1";
var reflectorAS = getSystemProperty("arm.reflector.as") || 65000;
var reflectorID = getSystemProperty("arm.reflector.id");
var targetIP = getSystemProperty("arm.target.ip");
var targetIP6 = getSystemProperty("arm.target.ip6");
var targetAS = getSystemProperty("arm.target.as");
var targetID = getSystemProperty("arm.target.id");
var targetPrefixes = getSystemProperty("arm.target.prefixes") || 20000;
var targetPrefixes6 = getSystemProperty("arm.target.prefixes6") || 20000;
var targetMinValue = getSystemProperty("arm.target.minvalue") || 0;
var sFlowIP = getSystemProperty("arm.sflow.ip") || reflectorIP;
var sFlowT = getSystemProperty("arm.sflow.t") || 10;

if(reflectorIP && reflectorAS) bgpAddNeighbor(reflectorIP,reflectorAS,reflectorID);
if(reflectorIP6 && reflectorAS) bgpAddNeighbor(reflectorIP6,reflectorAS,reflectorID,{'ipv6':true});
if(sFlowIP && reflectorIP && sFlowT) bgpAddSource(sFlowIP,{router:reflectorIP,router6:reflectorIP6},sFlowT,'bytes');

/**
 $ Add support for additional arm.sflow.ip addresses.
 * these are defined in a arm.sflow.ip.additional property and separated by a semicolon.
 * see https://github.com/sflow-rt/active-routes/issues/2
 **/
var sFlowIPs = getSystemProperty("arm.sflow.ip.additional");
if (sFlowIPs && reflectorIP && sFlowT) {
  sFlowIPs = sFlowIPs.split(';');
  sFlowIPs.forEach(function(ip){
    bgpAddSource(ip,{router:reflectorIP,router6:reflectorIP6},sFlowT,'bytes');
  });
}
/**/

if(targetIP && targetAS) bgpAddNeighbor(targetIP,targetAS,targetID);
if(targetIP6 && targetAS) bgpAddNeighbor(targetIP6,targetAS,targetID,{'ipv6':true});

sharedSet('arm_config', {reflectorIP:reflectorIP, targetIP:targetIP, targetPrefixes:targetPrefixes, targetMinValue:targetMinValue});
sharedSet('arm_config6', {reflectorIP:reflectorIP6, targetIP:targetIP6, targetPrefixes:targetPrefixes6, targetMinValue:targetMinValue});

setFlow('arm_bytes', {value:'bytes',n:10,t:flow_timeout,fs:SEP});
setFlow('arm_dstaspath', {keys:'bgpdestinationaspath', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_dstas', {keys:'bgpdestinationas', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_dstpeer', {keys:'bgpdestinationpeeras', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_srcas', {keys:'bgpsourceas', value:'bytes', n:10, t:flow_timeout, fs:SEP});

var other = '-other-';
function calculateTopN(agents,metric,n,minVal,total_bps) {     
  var total, top, topN, i, bps;
  top = activeFlows(agents,metric,n,minVal,'sum');
  var topN = {};
  if(top) {
    total = 0;
    for(i in top) {
      bps = top[i].value * 8;
      topN[top[i].key] = bps;
      total += bps;
    }
    if(total_bps > total) topN[other] = total_bps - total;
  }
  return topN;
}

function getMetric(res, idx, defVal) {
  var val = defVal;
  if(res && res.length && res.length > idx && res[idx].hasOwnProperty('metricValue')) val = res[idx].metricValue;
  return val;
}

var switch_metric_list = [
  'sum:ifindiscards',
  'sum:ifoutdiscards',
  'sum:ifinerrors',
  'sum:ifouterrors',
  'max:cpu_utilization',
  'max:load_one_per_cpu',
  'max:mem_utilization',
  'max:disk_utilization',
  'max:part_max_used',
  'max:bcm_host_utilization',
  'max:bcm_mac_utilization',
  'max:bcm_ipv4_utilization',
  'max:bcm_ipv6_utilization',
  'max:bcm_ipv4_ipv6_utilization',
  'max:bcm_long_ipv6_utilizaton',
  'max:bcm_total_routes_utilization',
  'max:bcm_ecmp_nexthops_utilization',
  'max:bcm_acl_ingress_utilization',
  'max:bcm_acl_ingress_meters_utilization',
  'max:bcm_acl_ingress_counters_utilization',
  'max:bcm_acl_egress_utilization',
  'max:bcm_acl_egress_meters_utilization',
  'max:bcm_acl_egress_counters_utilization'
];

var router_metric_list = [
  'sum:ifindiscards',
  'sum:ifoutdiscards',
  'sum:ifinerrors',
  'sum:ifouterrors',
  'max:cpu_utilization',
  'max:load_one_per_cpu',
  'max:mem_utilization',
  'max:disk_utilization',
  'max:part_max_used'
];

setIntervalHandler(function() {
  points = {};
  let now = (new Date()).getTime();

  res = metric(targetIP,switch_metric_list);
  points['discards'] = getMetric(res,0,0) + getMetric(res,1,0);
  points['errors'] = getMetric(res,2,0) + getMetric(res,3,0);
  points['cpu_util'] = getMetric(res,4,0);
  points['load_per_cpu'] = getMetric(res,5,0) * 100;
  points['mem_util'] = getMetric(res,6,0);
  points['disk_util'] = getMetric(res,7,0);
  points['part_max_util'] = getMetric(res,8,0);
  points['hw_host_util'] = getMetric(res,9,0);
  points['hw_mac_util'] = getMetric(res,10,0);
  points['hw_ipv4_util'] = getMetric(res,11,0);
  points['hw_ipv6_util'] = getMetric(res,12,0);
  points['hw_ipv4_ipv6_util'] = getMetric(res,13,0);
  points['hw_ipv6_long_util'] = getMetric(res,14,0);
  points['hw_total_routes_util'] = getMetric(res,15,0);
  points['hw_ecmp_nexthops_util'] = getMetric(res,16,0);
  points['hw_acl_ingress_util'] = getMetric(res,17,0);
  points['hw_acl_ingress_meters_util'] = getMetric(res,18,0);
  points['hw_acl_ingress_counters_util'] = getMetric(res,19,0);
  points['hw_acl_egress_util'] = getMetric(res,20,0);
  points['hw_acl_egress_meters_util'] = getMetric(res,21,0);
  points['hw_acl_egress_counters_util'] = getMetric(res,22,0);

  res = metric(reflectorIP,router_metric_list);
  points['router_discards'] = getMetric(res,0,0) + getMetric(res,1,0);
  points['router_errors'] = getMetric(res,2,0) + getMetric(res,3,0);
  points['router_cpu_util'] = getMetric(res,4,0);
  points['router_load_per_cpu'] = getMetric(res,5,0) * 100;
  points['router_mem_util'] = getMetric(res,6,0);
  points['router_disk_util'] = getMetric(res,7,0);
  points['router_part_max_util'] = getMetric(res,8,0);

  let top = activeFlows(sFlowIP,'arm_bytes',1,0,'sum');
  let bps = 0;
  if(top && top.length > 0) bps = top[0].value * 8;
  points['bps'] = bps;
  points['top-dst-aspath'] = calculateTopN(sFlowIP,'arm_dstaspath',5,1,bps);
  points['top-dst-as'] = calculateTopN(sFlowIP,'arm_dstas',5,1,bps);
  points['top-dst-peer-as'] = calculateTopN(sFlowIP,'arm_dstpeer',5,1,bps);
  points['top-src-as'] = calculateTopN(sFlowIP,'arm_srcas',5,1,bps);

  let stats = sharedGet('arm_stats') || {};
  points['bgp-nprefixes'] = stats['bgp-nprefixes'] || 0;
  points['bgp-adds'] = stats['bgp-adds'] || 0;
  points['bgp-removes'] = stats['bgp-removes'] || 0;
  points['cache-prefixes-added'] = stats['cache-prefixes-added'] || 0;
  points['cache-prefixes-removed'] = stats['cache-prefixes-removed'] || 0;
  points['cache-prefixes'] = stats['cache-prefixes'] || 0;
  points['cache-hitrate'] = stats['cache-hitrate'] || 0;
  points['cache-missrate'] = stats['cache-missrate'] || 0;
  points['cache-missdelete'] = stats['cache-missrecent'] || 0;
  points['cache-missadd'] = points['cache-missrate'] - points['cache-missdelete'];
  points['active-prefixes'] = stats['active-prefixes'] || 0;
  points['active-coverage'] = stats['active-coverage'] || 0;
  points['active-coveredprefixes'] = stats['active-coveredprefixes'] || 0;
  points['active-activeprefixes'] = stats['active-prefixes'] - stats['active-coveredprefixes'];

  stats = sharedGet('arm_stats6') || {};
  points['bgp-nprefixes6'] = stats['bgp-nprefixes'] || 0;
  points['bgp-adds6'] = stats['bgp-adds'] || 0;
  points['bgp-removes6'] = stats['bgp-removes'] || 0;
  points['cache-prefixes-added6'] = stats['cache-prefixes-added'] || 0;
  points['cache-prefixes-removed6'] = stats['cache-prefixes-removed'] || 0;
  points['cache-prefixes6'] = stats['cache-prefixes'] || 0;
  points['cache-hitrate6'] = stats['cache-hitrate'] || 0;
  points['cache-missrate6'] = stats['cache-missrate'] || 0;
  points['cache-missdelete6'] = stats['cache-missrecent'] || 0;
  points['cache-missadd6'] = points['cache-missrate'] - points['cache-missdelete'];
  points['active-prefixes6'] = stats['active-prefixes'] || 0;
  points['active-coverage6'] = stats['active-coverage'] || 0;
  points['active-coveredprefixes6'] = stats['active-coveredprefixes'] || 0;
  points['active-activeprefixes6'] = stats['active-prefixes'] - stats['active-coveredprefixes'];

  trend.addPoints(points);
}, 1);

setHttpHandler(function(req) {
  var result, key, name, path = req.path;
  if(!path || path.length == 0) throw "not_found";
     
  switch(path[0]) {
    case 'trend':
      if(path.length > 1) throw "not_found"; 
      result = {};
      result.trend = req.query.after ? trend.after(parseInt(req.query.after)) : trend;
      break;
    case 'metric':
      if(path.length == 1) result = points;
      else {
        if(path.length != 2) throw "not_found";
        if(points.hasOwnProperty(path[1])) result = points[path[1]];
        else throw "not_found";
      }
    default: throw "not_found";
  }
  return result;
});
