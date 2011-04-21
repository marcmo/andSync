var User,
    MusicItem,
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
		ObjectId = Schema.ObjectId;

function defineModels(mongoose, fn) {


  function validatePresenceOf(value) {
    return value && value.length;
  }

  User = new Schema({
    'name': String,
    'email': { type: String, validate: [validatePresenceOf, 'an email is required'], index: { unique: true } },
    'item_ids' : [ObjectId]
  });
  MusicItem = new Schema({
    'name'  : String,
    'date'  :  { type: Date, default: Date.now }
  });

  //define models
  mongoose.model('User', User);
  mongoose.model('MusicItem', MusicItem);

  fn();
}

exports.defineModels = defineModels; 
