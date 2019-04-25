const $ = require('jquery')
  , _ = require('lodash')
  , moment = require('moment')
  , validate = require("validate.js")
  , jsonPatch = require("fast-json-patch")
  , uuidv4 = require('uuid/v4')
  , Loader = require('core/loader')
  , formHtml = require('./form.html')
  , ace = require('brace') 
  , utils = require('core/utils')  
  , { checkPermission } = require('core/utils');

require('./form.scss');
require('bootstrap');
require('jquery-ui/ui/widget');
require('jquery-ui/ui/data');

require('brace/mode/json');
require('brace/theme/iplastic');
require('brace/ext/searchbox');
// require('brace/ext/error_marker');
// require('brace/ext/beautify');
// require('brace/ext/keybinding_menu');
// require('brace/ext/linking');
// require('brace/ext/statusbar');


$.widget("nm.form", {

  options:{
    isNew: false,
    constraints:{}
  },

  _create: function() {
    var o = this.options, self = this, client = o.document.getClient();

    this._addClass('nm-form', 'container-fluid');
    this.element.html(formHtml);

    if(!o.isNew){
      this.clone = _.cloneDeep(o.document);
    }

    this.$formHeader = $('.form-header', this.element),
    this.$icon = $('.icon', this.$formHeader);
    this.$favorite = $('.favorite', this.$viewHeader);
    this.$actions = $('.actions', this.$formHeader);
    this.$actionMoreMenu = $('.more>.dropdown-menu', this.$actions);
    this.$saveBtn =$('.save.btn', this.$actions);
    this.$cancelBtn = $('.cancel.btn', this.$actions);
    this.$formTitle = $('h4', this.$formHeader),
    this.$formContent = $('.form-content', this.element),
    this.$toolbox = $('.form-toolbox', this.$form),

    this.jsonEditor = ace.edit(this.$formContent.get(0));
    this.jsonEditor.$blockScrolling = Infinity
    this.jsonEditor.setTheme('ace/theme/iplastic');
    this.jsonEditor.getSession().setMode('ace/mode/json');
    this.jsonEditor.getSession().setOptions({
      tabSize:2
    });

    this.jsonEditor.setValue(JSON.stringify(o.document, null, 2), -1);
    this.jsonEditor.clearSelection();
    this.enableChange = true;
    this.jsonEditor.getSession().on('change', function(delta) {
      if(self.enableChange){
        var json;
        try { json =  JSON.parse(self.jsonEditor.getValue()); }catch(e){}
        if(json){
          o.document.replace(json);
          self._refreshHeader();
        }
      }
    });

    this._on(this.$actionMoreMenu, {
      'click li.dropdown-item.save-as': this._onSaveAs,
      'click li.dropdown-item.delete' : this._onDeleteSelf      
    });
    this._on(this.$saveBtn, {click: this._onSave});
    this._on(this.$cancelBtn, {click: this._onCancel});
    this._on(this.$favorite, {click: this._onFavorite});    

    this._refresh();
    this.jsonEditor.focus();
  },

  _onFavorite: function(e) {
    var o = this.options, doc = o.document, self = this, currentUser = client.currentUser, Profile = client.Profile;
    Profile.get(doc.domainId, currentUser.id, function(err, profile){
      if(err) return console.error(err);
      var oldFavorites = _.cloneDeep(profile.favorites), patch,
          index = _.findIndex(profile.favorites, function(f) {return f.domainId==doc.domainId&&f.collectionId==doc.collectionId&&f.id==doc.id;});
      if(index >= 0){
        patch = [{
          op:'remove',
          path: '/favorites/'+index            
        }];
      } else {
        patch = [profile.favorites ? {
          op:'add',
          path:'/favorites/-',
          value:{domainId:doc.domainId, collectionId: doc.collectionId, id: doc.id}
        } : {
          op:'add',
          path:'/favorites',
          value:[{domainId:doc.domainId, collectionId: doc.collectionId, id: doc.id}]
        }];
      }
      profile.patch({patch: patch}, function(err, profile){
        if(err) return console.error(err);
        self._refreshFavorite(profile.favorites);
        self.element.trigger('favoritechanged', [profile.favorites, oldFavorites]);
      });
    });
  },

  _onDeleteSelf: function(e){
    var doc = this.options.document, self = this, {User, Profile, Collection} = doc.getClient();
    doc.delete(function(err, result){
      if(err) return console.error(err);
      User.get(function(err, user){
        if(err) return console.error(err);
        Profile.get(doc.domainId, user.id, function(err, profile){
          if(err) return console.error(err);
          var index = _.findIndex(profile.favorites, function(f) {return f.domainId==doc.domainId&&f.collectionId==doc.collectionId&&f.id==doc.id;}),
              oldFavorites = _.cloneDeep(profile.favorites);
          if(index >= 0){
            profile.patch({patch:[{
              op:'remove',
              path: '/favorites/'+index            
            }]}, function(err, profile){
              if(err) return console.error(err);
              self.element.trigger('favoritechanged', [profile.favorites, oldFavorites]);
            });
          }
        });
      });

      Collection.get(doc.domainId, doc.collectionId, function(err, collection){
        if(err) return console.error(err);
        collection.refresh(function(err, result){
          if(err) console.error(err);
          self.$actionMoreMenu.dropdown('toggle').trigger('documentdeleted', doc);
        });
      })
    });

    e.stopPropagation();
  },

  _refresh: function(){
    var o = this.options, doc = o.document, self = this, currentUser = client.currentUser;
    checkPermission(doc.domainId, currentUser.id, 'patch', doc, function(err, result){
      if(!result){
        self.jsonEditor.setReadOnly(true);
      }
    });
    this._refreshFavorite();
    this._armActionMoreMenu();
    this._refreshHeader();
  },

  _refreshFavorite: function(favorites){
    var o = this.options;
    if(o.isNew){
      this.$favorite.hide();
    } else {
      var self = this, doc = o.document,　currentUser = client.currentUser, Profile = client.Profile;
      this.$favorite.show();
      
      function doRefreshFavorite(favorites){
        var $i = $('i', self.$favorite).removeClass();
        if(_.find(favorites, function(f) {return f.domainId==doc.domainId&&f.collectionId==doc.collectionId&&f.id==doc.id;})){
          $i.addClass('c-red-500 ti-star');
        }else{
          $i.addClass('ti-star');
        }
      }

      if(favorites){
        doRefreshFavorite(favorites);
      } else {
        Profile.get(doc.domainId, currentUser.id, {refresh: true}, function(err, profile){
          if(err) return console.error(err);
          doRefreshFavorite(profile.favorites);
        });
      }
    }
  },

  _refreshHeader: function(){
    var o = this.options, doc = o.document;
    this.$formTitle.html(doc.title||doc.id);    
    $('i', this.$icon).removeClass().addClass(doc._meta.iconClass||'ti-file');

    if(this._isDirty()){
      if(o.isNew){
        this.$saveBtn.html("Save as...");
      } else {
        this.$saveBtn.html("Save");        
      }
      this.$saveBtn.show();
      this.$cancelBtn.show();
    }else{
      this.$saveBtn.hide();
      this.$cancelBtn.hide();
    }
  },

  _getPatch: function(){
    return jsonPatch.compare(this.clone,  this.options.document);
  },

  _isDirty: function(){
    return this.options.isNew || this._getPatch().length > 0
  },

  _onSave: function(e){
    var o = this.options;
    if(o.isNew){
      this._onSaveAs();
    }else{
      this.save();
    }
  },

  save: function(){
    var o = this.options, self = this;
    if(this._isDirty()){
      o.document.patch({patch:this._getPatch()}, function(err, document){
        if(err) return console.error(err);

  	    _.forOwn(o.document,function(v,k){delete o.document[k]});
        _.merge(o.document, document);

        self.clone = _.cloneDeep(document);
        self._refresh();
      });
    }
  },

  saveAs: function(id, title, callback){
    var o = this.options, self = this, client = o.document.getClient(), errors = validate(this.$formTag, o.constraints);
    if (errors) {
      console.log(errors);
    } else {
      var doc = o.document, docInfo = _.cloneDeep(doc), domainId = doc.domainId, collectionId = doc.collectionId, params = [];
      docInfo.title = title;
      switch(collectionId){
        case '.domains':
        case '.users':
          params = [id, docInfo];
          break;
        case '.collections':
        case '.actions':
        case '.forms':
        case '.groups':
        case '.metas':
        case '.pages':
        case '.profiles':
        case '.roles':
        case '.views':
          params = [domainId, id, docInfo];
          break;
        default:
          params = [domainId, collectionId, id, docInfo];
      }
      params.push(function(err, doc){
        if(err) return console.error(err);
        var isNew = o.isNew;
        o.isNew = false;
        o.actionId = 'edit';
        o.document = doc;
        self.clone = _.cloneDeep(doc);
        self._setJsonEditorValue();
        self._refresh();
        callback ? callback(null, true) : console.log(true);
        self.closeIdTitleDialog();
        self.element.trigger('documentcreated', [doc, isNew]);
      });
      
      o.document.constructor.create.apply(o.document.constructor, params);
    }
  },

  _onShowSaveAsModel: function(e){
    var o = this.options, doc = o.document;
    this.$id.val(doc.id || uuidv4());
    this.$titleInput.val(doc.title||'');
  },

  _armActionMoreMenu: function(){
    var o = this.options, self = this, doc = o.document, currentUser = doc.getClient().currentUser;
    this.$actionMoreMenu.empty();
    $('<li class="dropdown-item save-as">Save as ...</li>').appendTo(this.$actionMoreMenu);

    utils.checkPermission(doc.domainId, currentUser.id, 'delete', doc, function(err, result){
      if(result){
        $('<li class="dropdown-item delete">Delete</li>').appendTo(self.$actionMoreMenu);
      }
    });

    if(!o.isNew){
      Loader.armActions(client, this, o.document, this.$actionMoreMenu, o.actionId);
    }
  },

  _onSaveAs: function(evt){
    var doc = this.options.document, self = this;
    this.showIdTitleDialog({
      modelTitle:'Save as...', 
      id: doc.id || uuidv4(), 
      title: doc.title || '', 
      placeholder:{
        id: 'Enter id of form',
        title: 'Entier title of form'        
      },
      submit:function(e, data){
      self.saveAs(data.id, data.title);
    }});
  },

  _onCancel: function(){
    var o = this.options;
    if(o.isNew){
      this.element.trigger('cancelaction');
    }else{
      var doc = o.document;
   	  _.forOwn(doc,function(v,k){delete doc[k]});
      _.merge(doc, this.clone);
      this._setJsonEditorValue();
      this._refresh();
    }
  },

  _setOptions: function( options ) {
    var o = this.options, self = this, isNew = options.isNew, document = options.document;
    this._super(options);
    if(document){
      if(isNew){
        delete self.clone;
      }else{
        o.isNew = false;
        self.clone = _.cloneDeep(document);
      }
      self._setJsonEditorValue();
      self._refresh();
    }
  },

  _setJsonEditorValue(){
    var o = this.options;
    this.enableChange = false;
    this.jsonEditor.setValue(JSON.stringify(o.document, null, 2), -1);
    this.jsonEditor.clearSelection();
    this.jsonEditor.focus();
    this.enableChange = true;
  },

  showIdTitleDialog: function(options){
    var self = this;
    import(/* webpackChunkName: "idtitle-dialog" */ 'idtitle-dialog/idtitle-dialog').then(({default: itd}) => {
      self.idtitleDialog = $('<div/>').idtitledialog(options).idtitledialog('show').idtitledialog('instance');
    });
    return this;
  },

  closeIdTitleDialog: function(){
    this.idtitleDialog && this.idtitleDialog.close();
    return this;
  },

  _destroy: function(){
    this.element.empty();    
  }
});