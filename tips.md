/**
 * HANDLING COMET REQUESTS WITHOUT USER_ID'S
 * ==================================================================
 * 
 * WHAT WE NEED IS A MULTI TAB MANAGER SYSTEM
 * WE NEED TO TRACK THE CONNECTION NUMBERS REQUESTED FROM A EACH SID
 * 
 * ===========================
 * because we have an EXIT and JOIN events
 * we have to 
 * 		ADD when JOIN
 * 			CREATE connection holder IF connections == 0
 * 			INCREMENT connections
 * 		REMOVE when EXIT
 * 			DECREMENT connections
 * 			DELETE connection holder IF connections == 0
 * 
 * ===========================
 * WHEN a PACKAGE arrives we need to identify 
 * the CONNECTION_ID too not just the SID
 * 
 * SO we can TRANSMIT the MESSAGE in the RIGHT TAB
 * AND NOT for all TABS
 * 
 * ===========================
 * THE question is WHERE TO STORE the CONNECTION_ID?
 * 		COOKIES are forbidden because they are session wide.
 * 		
 * 		THE ONLY SOLUTION IS TO STORE IT ON CLIENT SIDE
 * 		AND WITH EVERY COMET REQUEST YOU WILL SEND THESE 
 * 		CONNECTION INFORMATIONS ALOND WITH THE PACKAGE
 
 		ON SERVER SIDE you don't store it because
 		the CONNECTION_ID will be CREATED on each request
 * ===========================	
 */