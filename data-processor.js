function DataProcessor() {
	this.databaseName_ = "better-meetings";
	this.databaseInstance_ = null;
}

/**********************/
/** Public functions **/
/**********************/
DataProcessor.prototype.init = function(successCallback, failureCallback, upgradeCallback) {
	var dbOpenRequest = indexedDB.open(this.databaseName_, 1);
 
	dbOpenRequest.onsuccess = function(e) {
		console.log("onsuccess opening DB");
		this.databaseInstance_ = e.target.result;
		if(successCallback) { successCallback(e); }
	}.bind(this);
	
	dbOpenRequest.onerror = function(e) {
		console.warn("onerror opening DB");
		console.warn(e);
		if(failureCallback) { failureCallback(e); }
	}.bind(this);

	dbOpenRequest.onupgradeneeded = function(e) {
		console.log("onupgradeneeded opening DB");
		this.databaseInstance_ = e.target.result;
		if(upgradeCallback) { upgradeCallback(e); }
	}.bind(this);
}

// TODO: support array of initial "objectStoreNames" and "keys"
DataProcessor.prototype.initWithObjectStoreAndKeyPath = function(objectStoreName, keyPath, successCallback, failureCallback) {
	var dbOpenRequest = indexedDB.open(this.databaseName_, 1);
	var upgradeNeeded = false;

	dbOpenRequest.onsuccess = function(e) {
		this.databaseInstance_ = e.target.result;
		// Ensure that success callback is only called once
		if(successCallback && !upgradeNeeded) { successCallback(e); }
	}.bind(this);
	
	dbOpenRequest.onerror = function(e) {
		console.warn("onerror opening DB");
		console.warn(e);
		if(failureCallback) { failureCallback(e); }
	}.bind(this);

	dbOpenRequest.onupgradeneeded = function(e) {
		console.log("onupgradeneeded opening DB");
		upgradeNeeded = true;
		this.databaseInstance_ = e.target.result;

		// "onupgradeneeded is the only place where you can alter the structure of the database."
        // https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
		this.createObjectStoreWithKeyPath(objectStoreName, keyPath, successCallback);
	}.bind(this);
}

DataProcessor.prototype.getValueForKeyFromObjectStore = function(key, objectStoreName, successCallback, failureCallback) {
	var operation = function(objectStore){ 
		return objectStore.get(key); 
	}.bind(this);

	var successCallbackWrapped = function(e){ 
		successCallback(e.target.result); 
	}.bind(this);

	this.execOperationOnObjectStore_(operation, "readonly", objectStoreName, 
		"getValueForKeyFromObjectStore", successCallbackWrapped, failureCallback);
}

DataProcessor.prototype.getAllFromObjectStore = function(objectStoreName, successCallback, failureCallback) {
	var operation = function(objectStore){ 
		return objectStore.getAll(); 
	}.bind(this);

	var successCallbackWrapped = function(e){ 
		successCallback(e.target.result); 
	}.bind(this);

	this.execOperationOnObjectStore_(operation, "readonly", objectStoreName, 
		"getAllFromObjectStore", successCallbackWrapped, failureCallback);
}

DataProcessor.prototype.addValueToObjectStore = function(value, objectStoreName, successCallback, failureCallback) {
	var operation = function(objectStore){ 
		return objectStore.add(value);
	}.bind(this);

	this.execOperationOnObjectStore_(operation, "readwrite", objectStoreName, 
		"addValueToObjectStore", successCallback, failureCallback);
}

DataProcessor.prototype.updateValueInObjectStore = function(value, objectStoreName, successCallback, failureCallback) {
	var operation = function(objectStore) { 
		// Note: this merges objects rather than replacing (conflicts will be overwritten by new value)
		return objectStore.put(value);
	}.bind(this);

	this.execOperationOnObjectStore_(operation, "readwrite", objectStoreName, 
		"updateValueForKeyInObjectStore", successCallback, failureCallback);
}

DataProcessor.prototype.createObjectStoreWithKeyPath = function(objectStoreName, keyPath, successCallback) {
	if(!this.objectStoreExists(objectStoreName)) {
		console.log("createObjectStoreWithKeyPath no object " + objectStoreName);
		objectStore = this.databaseInstance_.createObjectStore(objectStoreName, { keyPath : keyPath });
		objectStore.transaction.oncomplete = function(event) {
			successCallback();
		}
	} else {
		// Already contains object store
		successCallback();
		console.log("createObjectStoreWithKeyPath found object " + objectStoreName);
	}
}

DataProcessor.prototype.objectStoreExists = function(objectStoreName) {
	return this.databaseInstance_.objectStoreNames.contains(objectStoreName);
}

/***********************/
/** Private functions **/
/***********************/

DataProcessor.prototype.execOperationOnObjectStore_ = function(operation, readWrite, objectStoreName, logPrefix, successCallback, failureCallback) {
	var transaction = this.databaseInstance_.transaction(objectStoreName, readWrite);
	var objectStore = transaction.objectStore(objectStoreName);
	var objectStoreRequest = operation(objectStore);

	objectStoreRequest.onsuccess = function(e) {
		//console.log(logPrefix + " onsuccess");
		//console.log(e);
		if(successCallback) { successCallback(e); }
	}.bind(this);
	objectStoreRequest.onerror = function(e) {
		//console.warn(logPrefix + " onerror");
		//console.warn(e);
		if(failureCallback) { failureCallback(e); }
	}.bind(this);
}