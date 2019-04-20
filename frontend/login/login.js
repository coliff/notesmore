import validate from "validate.js";

var client = require('../../lib/client')();

import loginHtml from './login.html';
import './login.scss';

$.widget("nm.login", {
  options: {
    maxSMSCount: 3,       //获取最大验证码次数
    waitSMSTime: 10,      //每次获取验证码后等待时长
    hour: 1,              //短信次数用完后等待的小时数
    timeoutLogin: false,  //超时登录
    constraints: {
      'model-1': {
        username: {
          presence: { message: '请输入手机号码或邮箱地址' },
          // format: {
          //   pattern: /(1\d{10})|(\w+@\w+\.\w{2,3})/,
          //   message: "请输入正确的手机号码或邮箱地址"
          // }
        },
        password: {
          presence: { message: '请输入登录密码' },
          // format: {
          //   pattern: /.{8,}/,
          //   message: "密码错误"
          // }
        }
      },
      'model-2': {
        phones: {
          presence: { message: '请输入手机号码' },
          format: {
            pattern: /1\d{10}/,
            message: "请输入正确的手机号码"
          }
        },
        code: {
          presence: { message: '请输入短信验证码' },
          format: {
            pattern: /\d{6}/,
            message: "短信验证码错误"
          }
        }
      }
    }
  },

  _create() {
    this._addClass('nm-login');
    this.element.html(loginHtml);

    this.$signupBtn = $('.footer a', this.element);
    this.$input = $('input', this.element);
    this.$verifyCode = $('.verify-code', this.element);

    this._getverifyCode();


    if (this.options.timeoutLogin) {
      this.element.find('.content').removeClass('bg-img')
        .find('.copy').remove().end()
        .find('.model-1 .forget').remove().end()
        .find('.help').addClass('mar-bottom').next().remove();
      this.element.find('.model-0').show().next().hide();
    } else {
      //切换到注册
      this._on(this.$signupBtn, {
        'click': function () {
          runtime.option({ uriAnchor: { col: '.pages', doc: '.signup' }, override: false });
        }
      });

      //忘记密码
      this._on(this.element.find('.forget'), {
        'click': function () {
          runtime.option({ uriAnchor: { col: '.pages', doc: '.forgit-password' }, override: false });
        }
      });
    }

    //输入完后校验数据
    this._on(this.$input, {
      'change': function (e) {
        let $target = $(e.currentTarget)
          , error = this._verifyData($target) || {};
        this._showError($target, error[$target.attr('name')]);
      }
    });

    //切换登录方式
    this._on(this.element.find('.toggle'), {
      'click': function (e) {
        $(e.currentTarget).parents('.model').hide().siblings('.model').show();
      }
    });

    //登录
    this._on(this.element.find('.submit-btn'), { 'click': this._submit });
  },

  _destroy() {
    this.element.removeClass("nm-login");
  },

  /**
   * 登录
   *
   */
  _submit(e) {
    let $target = $(e.currentTarget)
      , $model = $target.parents('.model')
      , error = this._verifyData($target)
      , self = this
      , hasError = false;

    error && $model.find('input').each(function (i, v) {
      let $v = $(v);
      hasError = true;
      self._showError($v, error[$v.attr('name')]);
    });

    if (hasError) return false;

    let inputData = validate.collectFormValues($model, { trim: true });
    console.log(inputData);
    $target.addClass('ui-state-disabled');
    client.login(inputData.username, inputData.password, function (err, user) {
      $target.removeClass('ui-state-disabled');
      if (err) {
        console.error('login-error', err.message);
        $model.find('.verify-code .error,.password .error').addClass('show').text(err.message);
        return false;
      }
      runtime.option({ uriAnchor: { col: '.pages', doc: '.workbench' }, override: true });
    });

  },

  /**
   * 获取验证码
   *
   */
  _getverifyCode() {
    this._on(this.$verifyCode, {
      'click span': function (e) {
        let $target = $(e.currentTarget)
          , waitSMSTime = this.options.waitSMSTime
          , maxSMSCount = this.options.maxSMSCount
          , hour = this.options.hour
          , phoneVal = $('.phones', this.element).val().trim()
          , countObj = JSON.parse(localStorage.getItem('getSMSCount') || '{}')
          , error = this._verifyData(this.$verifyCode) || {}
          , interval
          , count;

        if (error['phones']) {
          this._showError($('.phones', this.element), error[$('.phones', this.element).attr('name')]);
          return false;
        }

        //恢复24小时候的数据
        $.each(countObj, function (k, v) {
          if (v.time + hour * 60 * 60 * 1000 < new Date().getTime()) {
            v.count = 0;
          }
        });

        count = parseInt((countObj[phoneVal] && countObj[phoneVal]['count']) || '0')
        if (count >= maxSMSCount) {
          this._showError($(e.currentTarget), ['对不起，您获取验证码次数超过' + maxSMSCount + '次，请' + hour + '小时后再次获取。'])
          return false;
        }
        count++;
        countObj[phoneVal] = { count: count, time: new Date().getTime() };
        localStorage.setItem('getSMSCount', JSON.stringify(countObj));
        $target.addClass('disabled ui-state-disabled').text(waitSMSTime + '秒后可重发');
        interval = setInterval(() => {
          if (--waitSMSTime <= 0) {
            clearInterval(interval);
            $target.removeClass('disabled ui-state-disabled').text('获取短信验证码');
            return false;
          }
          $target.text(waitSMSTime + '秒后可重发');
        }, 1000);
      }
    });
  },

  /**
   * 校验输入数据
   *
   * @param {*} $el
   * @returns
   */
  _verifyData($el) {
    let $model = $el.parents('.model')
      , error = validate($model, this.options.constraints[$model.data('model')]);
    console.log(error);
    return error;
  },

  /**
  * 显示错误
  *
  * @param {*} element jquery对象
  * @param {string} [text=''] 错误文本
  */
  _showError(element, text = []) {
    let $error = element.parents('.row').find('.error');
    text = text[0] || '';
    text = text.split(' ');
    if (text.length > 1) {
      text = text.slice(1);
    }
    text = text.join('');
    if (text) {
      $error.addClass('show').text(text);
    } else {
      $error.removeClass('show').text('');
    }
  }

});
