var crypto = require('crypto'),
    User,
    MusicItem,
    mongoose = require('mongoose'),
    util = require('util'),
    log4js = require('log4js')(),
    logger = log4js.getLogger("and"),
    Schema = mongoose.Schema,
		ObjectId = Schema.ObjectId;

function defineModels(mongoose, fn) {


  function validatePresenceOf(value) {
    logger.debug("validate:" + value);
    return value && value.length;
  }

  User = new Schema({
    'email': { type: String, validate: [validatePresenceOf, 'an email is required'], index: { unique: true } },
    'hashed_password': String,
    'salt': String,
    'item_ids' : [ObjectId]
  });
  User.virtual('id')
    .get(function() {
      logger.debug("virtual user get id:" + JSON.stringify(this));
      return this._id.toHexString();
    });

  User.virtual('password')
    .set(function(pswd) {
      logger.debug("setting password of user:" + JSON.stringify(this) + " to " + pswd);
      this.salt = this.makeSalt();
      this.hashed_password = this.encryptPassword(pswd);
    })
    .get(function() {
      logger.debug("getting password of user:" + JSON.stringify(this));
      return this.hashed_password; });
  User.method('authenticate', function(plainText) {
    logger.debug("autthentication with password:" + plainText);
    if (plainText.length === 0) { return false; }
    return this.encryptPassword(plainText) === this.hashed_password;
  });
  
  User.method('makeSalt', function() {
    logger.debug("makeSalt");
    return Math.round((new Date().valueOf() * Math.random())) + '';
  });

  User.method('encryptPassword', function(password) {
    logger.debug("encryptPassword, salt:" + this.salt + ", password:" + password);
    return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
  });

  User.pre('save', function(next) {
    logger.debug("pre-save, this=" + JSON.stringify(this));
    if (!validatePresenceOf(this.password)) {
      next(new Error('Invalid password'));
    } else {
      next();
    }
  });
  
  /**
    * Model: LoginToken
    *
    * Used for session persistence.
    */
  LoginToken = new Schema({
    email: { type: String, index: true },
    series: { type: String, index: true },
    token: { type: String, index: true }
  });

  LoginToken.method('randomToken', function() {
    return Math.round((new Date().valueOf() * Math.random())) + '';
  });

  LoginToken.pre('save', function(next) {
    // Automatically create the tokens
    this.token = this.randomToken();

    if (this.isNew){
      this.series = this.randomToken();
    }

    next();
  });

  LoginToken.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });

  LoginToken.virtual('cookieValue')
    .get(function() {
      return JSON.stringify({ email: this.email, token: this.token, series: this.series });
    });

  MusicItem = new Schema({
    'name'  : String,
    'date'  :  { type: Date, default: Date.now }
  });

  //define models
  mongoose.model('User', User);
  mongoose.model('LoginToken', LoginToken);
  mongoose.model('MusicItem', MusicItem);

  fn();
}

exports.defineModels = defineModels; 
