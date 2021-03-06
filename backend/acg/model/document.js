module.exports = Document;

const _ = require('lodash')
  , uuidv4 = require('uuid/v4')
  , createError = require('http-errors')
  , jsonPatch = require('fast-json-patch')
  , NodeCache = require("node-cache")
  , { uniqueId, documentHotAlias, documentAllAlias, eventAllAlias, buildMeta, createEntity, getEntity} = require('./utils');

const DOC_TYPE = 'snapshot'
  , EVENT_TYPE = 'event';

var elasticsearch, cache;

function Document(domainId, collectionId, docData) {
  Object.defineProperties(this, {
    domainId: {
     value: domainId,
     writable: false,
     enumerable: false,
     configurable: false
    },
    collectionId: {
      value: collectionId,
      writable: false,
      enumerable: false,
      configurable: false
    },
    id: {
      value: docData.id,
      writable: false,
      enumerable: true,
      configurable: false
    }
  });
    
  _.assign(this, docData);

  Object.defineProperties(this, {
    _meta: {
      value: this._meta,
      writable: true,
      enumerable: true,
      configurable: true
    }
  });
}

_.assign(Document, {
  
  TYPE: DOC_TYPE,

  EVENT_TYPE:EVENT_TYPE,

  init: function(config) {
    elasticsearch = config.elasticSearch;
    cache = new NodeCache(config.ncConfig);
    return Document;
  },

  create: function(authorId, domainId, collectionId, documentId, docData, options) {
    return createEntity(elasticsearch, authorId, domainId, collectionId, documentId, docData, options).then(data => {
      var document = new Document(domainId, collectionId, data);
      cache.set(uniqueId(domainId, collectionId, documentId), document);
      return document;
    });
  },

  get: function(domainId, collectionId, documentId, options){
    var uid = uniqueId(domainId, collectionId, documentId), version = _.at(options, 'version')[0], document;
    uid = version ? uid + '~' + version : uid;
    document = cache.get(uid);
    if(document){
      return Promise.resolve(document);
    }else{
      return getEntity(elasticsearch, domainId, collectionId, documentId, options).then(data => {
        document = new Document(domainId, collectionId, data);
        cache.set(uid, document);
        return document;
      });
    }
  },

  find: function(domainId, collectionId, query, options) {
    query.index = documentAllAlias(domainId, collectionId || '*');
    query.type = DOC_TYPE;
    query.version = true;

    if(options&&options.sort) query.body.sort = options.sort;
    if(options&&options.from) query.from = options.from;
    if(options&&options.size) query.size = options.size;
    if(options&&options.scroll) query.scroll = options.scroll;

  	return elasticsearch.search(query).then(function(data){
  	  var result = {
  	    total:data.hits.total,
  	    offset: query.from || 0,
  	    documents: _.reduce(data.hits.hits, function(r, v, k){
  	      var doc = _.cloneDeep(v._source);
  	      doc.id = doc.id || v._id;
          _.set(doc, '_meta.index', v._index);
          _.set(doc, '_meta.version', v._version);
  	      r.push(doc);
  	      return r;  	        	      
  	    },[])
  	  };
  	  
  	  if(data._scroll_id) result.scrollId = data._scroll_id;

  	  return result;
  	});
  },

  scroll: function(options){
  　return elasticsearch.scroll(options).then(function(data){
  	  return {
  	    total: data.hits.total,
  	    scrollId: data._scroll_id,
  	    documents: _.reduce(data.hits.hits, function(r, v, k){
  	      var doc = _.cloneDeep(v._source);
  	      doc.id = doc.id || v._id;
  	      doc._meta.index = v._index;
  	      r.push(doc);
  	      return r;  	        	      
  	    },[])
  	  };
  　});
  },

  clearScroll: function(options){
  　return elasticsearch.clearScroll(options);
  }

});

_.assign(Document.prototype, {
  _getElasticSearch: function(){
    return elasticsearch;
  },

  _getCache: function(){
    return cache;
  },

  getEventHotAlias: function(){
    return this.domainId + '~' + this.collectionId + '~hot~events';
  },

  get: function() {
    return Promise.resolve(this);
  },

  _doPatch: function(patch, options) {
    var esc = this._getElasticSearch(), cache = this._getCache(), batch = [], p = patch.patch, 
      oldValue = JSON.stringify(_.cloneDeep(this)), errors = jsonPatch.validate(p, this);

    if(errors && errors.length > 0){
      return Promise.reject(errors);
    }

    try {
      newDoc = jsonPatch.applyPatch(jsonPatch.deepClone(this), p).newDocument
	  for(var key in this) {
  		if(this.hasOwnProperty(key)&&!_.isFunction(this[key])) try{delete this[key];}catch(e){}
	  }
      _.merge(this, newDoc);
    } catch (e) {
      return Promise.reject(e);
    }

    if (this._meta.created == this._meta.updated) {
      batch.push({index:{_index: this.getEventHotAlias(), _type: EVENT_TYPE}});
      batch.push({
        id: this.id, 
        patch: [{ op: 'add', path: '', value: oldValue }],
        version: this._meta.version - 1,
        _meta: patch._meta
      });
    }

    batch.push({index:{_index: this.getEventHotAlias(), _type: EVENT_TYPE}});
    batch.push({
      id: this.id,
      patch: _.reduce(p, function(result,value,key){
               var v = _.cloneDeep(value);
               v.value = JSON.stringify(v.value);
               result.push(v);
               return result;
             }, []),
      version: this._meta.version,
      _meta:patch._meta
    });

    batch.push({index:{ _index: this._meta.index, _type: DOC_TYPE, _id: this.id, _version: this._meta.version }});
    _.merge(this, {_meta:{updated: new Date().getTime(), version: this._meta.version + 1}});
    batch.push(this);

    return esc.bulk({body:batch});
  },

  patch: function(authorId, patch, options) {
    var self = this, uid = uniqueId(this.domainId, this.collectionId, this.id);
    return this._doPatch(_.merge(patch, {_meta:{author: authorId, created: new Date().getTime()}}), options).then(result => {
      return self;
    });
  },

  delete: function(authorId, options) {
    var self = this, docData = JSON.stringify(this), meta = {author: authorId, created: new Date().getTime()};
    return this._getElasticSearch().bulk({ body:[
      {delete:{_index: this._meta.index, _type: DOC_TYPE, _id: this.id}},
      {index: {_index: this.getEventHotAlias(), _type: EVENT_TYPE}},
      {patch: [{op: 'remove', path: '', value: JSON.stringify(docData)}], id:this.id, version: this._meta.version, _meta:meta}
    ]}).then( result =>{
      self._getCache().del(uniqueId(self.domainId, self.collectionId, self.id));
      return true;
    });
  },

  getEvents: function(options){
    return this._getElasticSearch().search(_.merge({
      index: eventAllAlias(this.domainId, this.collectionId), 
      type: EVENT_TYPE,
      body: {
        query:{
          term:{'id.keyword':this.id}
        },
        sort: [{ 
          '_meta.created': {order : "desc"}
        },{
          version: {order: "desc"}
        }]
      }
    }, options)).then(function(data){
      return {
  	    total:data.hits.total,
  	    offset: 0,
  	    events: _.reduce(data.hits.hits, function(r, v, k){
  	      var event = _.cloneDeep(v._source);
  	      event.id = event.id || v._id;
  	      event._meta.index = v._index;
  	      r.push(event);
  	      return r;  	        	      
  	    },[])
      }      
    });
  },

  getMeta: function() {
    return Promise.resolve(this._meta);
  },

  patchMeta: function(authorId, metaPatch, options) {
    var self = this, uid = uniqueId(this.domainId, this.collectionId, this.id);
    _.each(metaPatch.patch, function(p){ p.path = "/_meta" + p.path; });
    return this._doPatch(_.merge(metaPatch, {_meta:{author: authorId, created: new Date().getTime()}})).then(result => {
      self._getCache().del(uid);
      return self._meta;
    });
  },

  clearAclSubject: function(visitorId, method, rgu, subjectId, options) {
    var self = this, uid = uniqueId(this.domainId, this.collectionId, this.id), acl = _.cloneDeep(this._meta.acl), patch;
    if(method == '*'){
      _.each(acl,function(v1,k1){
        _.each(v1, function(v2,k2){
         if(k2 == rgu){
            _.remove(v2, function(u){return u == subjectId});
            return false;           
         }else if('*' == rgu){
           _.remove(v2, function(u){return u == subjectId});
         }
        });
      });
    } else if(acl[method]){
      _.each(acl[method], function(v2,k2){
         if(k2 == rgu){
            _.remove(v2, function(u){return u == subjectId});
            return false;           
         }else if('*' == rgu){
           _.remove(v2, function(u){return u == subjectId});
         }
      });
    }

    patch = jsonPatch.compare({_meta:{acl:this._meta.acl}}, {_meta:{acl:acl}});

    return this._doPatch({patch: patch, _meta:{author: authorId, created: new Date().getTime()}}).then( result => {
      self._getCache().del(uid);
      return self._meta.acl;
    });
  },

  getMetaId: function() {
    return Promise.resolve(this._meta.metaId);
  }

});

// module.exports = Document;
