# **Comet.js v.0.5** - It's is a flexible long polling module for node.js with support for unlimited listener types, multi and single listeners, custom sender identification. It has mysql integration, and a simple API. 

## Dependencies 					 
---------------------------------------
The module is based on the application framework and it uses mysql as a database handler.

## A tiny chat client in less than 55 lines		 
---------------------------------------

### Server side
You will need to include this in your `server.js` like `use('comet.js')`
```
	// REQUIRE comet module
	comet = new Comet({
		app		 : app,
		database : 'my_projects_database',
		id		 : function(request, response){ return request.cookies.sid; },
		sender	 : function(request, mysql, callback){ 
			mysql.users.getBy('id', request.cookies.id, function(users){
				callback(new User(users[0])); 
			});
		}
	});
	
	// COLLECT Listeners
	var everyone = [];
	comet.listener('home', function(request, package, mysql, options, end){
		end(everyone, options, false);
	});
	
	// JOIN event
	var join 		= comet.actions('join');
	join.onEmit 	= baseEmit
	join.onSubmit 	= function(mysql, request, response, package, private, listener, end){
		everyone.push(request.cookies.id);
		end();
	}
	
	// LEAVE event
	var leave 		= comet.actions('leave');
	leave.onEmit 	= baseEmit;
	leave.onSubmit 	= function(mysql, request, response, package, private, listener, end){
		everyone.remove(request.cookies.id);
		end();
	}
```

### Client Side
You will have to include the auto generated `/scripts/comet.js`
```html
	<script src="/scripts/comet.js" type="text/javascript"></script>
```	
```javascript
	<script>
		window.onload = function(){
			// PUSH join
			comet.push({ type: 'join', listeners: ['home'] });
			
			// PUSH messages
			comet.push({ type: 'message', listeners: ['home'], message: 'Hello World!' });
			comet.push({ type: 'message', listeners: ['home'], message: 'This is comet.js!' });
		}
		
		// PUSH leave
		window.onunload = function(){
			comet.push({ type: 'leave', listeners: ['home'] });
		}
	
		// LISTEN on join, leave and message events
		comet.ping.join 	= function(package){ console.log('joined', package); }
		comet.ping.leave 	= function(package){ console.log('leaved', package); }
		comet.ping.message 	= function(package){ console.log(package.sender, ' -> ', package.message); }
	</script>
```

## Server side module variables							
---------------------------------------
### app: `object` `required`
+ an `Application()` Object

### database: `string` `required`				
+ custom mysql database name
	
### id: `function` `required`
+ internal sender ID identifier
+ this can be a string or a number, it is usually the `request.cookies.id`

### sender: `function` `required`
+ overall sender identifier 
+ this can be anything, but it's usually a user Object with name, location etc..
+ it is usually used on the receivers side to show who sent the message

### emitOnEndFilter: `function` `optional`
+ a filter function which runs just before the emit, which has the right to pass or stop the emit event
+ it can be used for ignore list filtering

## Client side implementaton							
---------------------------------------
When you use the comet module on server side, a path for the client side js file will be generated in your `public/scripts/comet.client` what you can include in your html file like this:
```html
	<script src="/scripts/comet.js" type="text/javascript"></script>
```	
After you included the `comet.js` file you will have access to the global `comet` object.

### Initializing:
```javascript
	comet.controller(); 			// start the controller
	setTimeout(comet.worker, 1000); // starts the worker 1 second later for safety
``` 
After you initialized you don't have to worry about anything except sending and receiving information in real-time with `push` function and `ping` object.

### comet.push(package)
This function broadcasts a message with the specified `package`:

+ **type**			: This is a custom type of the message action  `string` `required`
+ **listeners**		: If it's an array then it will be sent to a group of people, if it's a string or an intenger then it will be sent to that single client. `string, integer or array` `required`
+ **parameters**	: whatever else you put in the package it is considered as package parameters. `optional` `anything`

An example push request:
```javascript
	comet.push({
		type: 'join',
		listeners: ['family'],
		my_custom_message: 'Hi family members!'
	})
```

### comet.ping
This is where you can assign listeners to the actions, for example you can listen to the join event above with:
```javascript
	comet.ping.join = function(package){
		console.log(package) 
		// output => { type: 'join', listeners: ['family'], my_custom_message: 'Hi family members!' }
	}
```
	
## Versions 									  
---------------------------------------
### New in v0.5 - (February 13, 2013):
+ Automatic client js path `app.public+/scripts/comet.client`
+ Submit Before Emit Introduced
+ New comet.action interface to support `submit_before_emit`
+ Each package now is stamped with a Unique Package ID (`package._stamp`)
+ Each request is stamped with a `request.comet_id` by `COMET.id()`
+ Improved documentation
	
### New in v0.4 - (October 3, 2012):
+ Totally stand-alone module
+ Accepts variables
+ Cleaned-up inner module interface
	
### New in v0.3 - (Summer 2012):
+ Half stand alone module
+ Pressure control with `Controller/workers` mechanism
+ 99% message transmission success
+ Several bug fixes
+ Custom listeners
	
### New in v0.2 - (Spring 2012)
+ Private object in package
+ Server side comet.push()
+ Better & stand alone client-side comet modules
	
### New in v0.1 - (Summer 2011):
+ Custom message types

## TODO 									  
---------------------------------------
+ Support database handlers other than mysql
+ Shortcuts for messaging channels, like create a new channel instance with already setup `join`, `leave`, `create`, `update`, `delete` types and register the `channel` listener.
