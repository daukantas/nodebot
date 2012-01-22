// Tagger.js
//
// Breaks up speech into components and assists with
// classifying things such as the subject, ownership,
// and action for a statement
//
// Note: I am not a linguist, this is the result of
// writing whatever logic it takes to get the tests
// to work.
//
// Please help me make this better:
// https://github.com/nhunzaker/nodebot
// -------------------------------------------------- //

var lev = require("levenshtein")
,   pos = require('pos')
,   lexer  = new pos.Lexer()
,   tagger = new pos.Tagger()
,   fileEx = Nodebot.lexicon.file["regular expression"]
;


// Finds the closest match between a statement
// and a body of words
var closest = module.exports.closest = function(string, words) {

    var shortest = words.toString().length
    ,   bestFit  = "";
    
    if (typeof words === 'string') {
        words = lexer.lex(words);
    }

    words.forEach(function(word) {
        
        var distance = lev(string, word);
        
        if (distance < shortest) {
            bestFit  = word;
            shortest = distance;
        }

    });
    
    return bestFit;
}

// Checks if a string is fileish
var isFile = module.exports.isFile = function(string) {
    string = string || "";
    return (string.replace(/\s/g, "").match(fileEx) !== null);
};


// Returns the part of speech for a particular word
var getType = module.exports.getType = function (string) {
    
    if (string) {
        return tagger.tag(lexer.lex(string))[0][1];
    } else {
        return undefined;
    }
    
};

// Strips all words of specific type(s) from an array of words
var stripTypes = module.exports.stripTypes = function(words, types) {

    types = (typeof types === "string") ? [types] : types;

    words = words.filter(function(w) {
        return types.indexOf(getType(w)) < 0;
    });
    
    return words;
}


// Finds all words between the last of the first and last
// of two types
var getBetween = module.exports.getBetween = function(lex, type1, type2, form) {

    var tagged = tagger.tag(lex)
    , filter1 = filter2 = start = end = [];

    form = form || "outside"

    type1 = (typeof type1 === 'string') ? [type1] : type1;
    type2 = (typeof type2 === 'string') ? [type2] : type2;

    filter1 =  tagged.filter(function(i) { return type1.indexOf(i[1]) !== -1 }) || [];
    filter2 =  tagged.filter(function(i) { return type2.indexOf(i[1]) !== -1  }) || [];
    
    if (form === "outside") {
        start = (filter1[0]) ? filter1[0][0] : undefined
    } else {
        start = (filter1.slice(-1)[0]) ? filter1.slice(-1)[0][0] : undefined
    }

    end = (filter2.slice(-1)[0]) ? filter2.slice(-1)[0][0] : undefined;
    
    
    return (start || end) ? lex.slice(lex.indexOf(start) + 1, lex.indexOf(end) + 1) : [];

};

// Classifies all words in an array
var getTypes = module.exports.getTypes = function (array, string, strict) {

    // Is the array lexical?
    if (typeof array[0] !== 'object') {
        array = tagger.tag(array)
    }

    var type = array.filter(function(word) {

        if (strict) {
            return (word[1] === string);
        } else {
            return (word[1].slice(0,string.length) === string);
        }

    }).map(function(w) { return w[0] });

    
    return type;
};


var classify = module.exports.classify = function(speech, debug) {

    var text   = speech || process.argv.slice(2).join(" ")
    ,   words  = lexer.lex(text)
    ,   tagged = tagger.tag(words)
    ,   action, subject, owner;


    if (debug) console.log(tagged);


    // Auto correct for missing punctuation
    if (getType(words.slice(-1)[0]) !== ".") {
        words.push(".");
    }

    // Classify!
    // -------------------------------------------------- //

    var verbs       = getTypes(tagged, "VB")
    ,   nouns       = getTypes(tagged, "NN")
    ,   pronouns    = getTypes(tagged, "PRP") // finds all posessive pronouns
    ,   actions     = getTypes(tagged, "W")
    ,   adverbs     = getTypes(tagged, "R")
    ,   adjectives  = getTypes(tagged, "JJ")
    ,   preps       = getTypes(tagged, "IN")
    ,   determiners = getTypes(tagged, "DT")
    ,   to          = getTypes(tagged, "TO")
    ;


    // ACTION
    // Answers : "What should the nodebot do after given a 
    // command"
    // -------------------------------------------------- //

    // Are there known action words present?
    if (actions.length > 0) {
        action = actions[0];
    } 

    // Are there base verbs present? Then it's probably
    // the first verb
    else if (getTypes(tagged, "VB", true).length > 0) {
        action = getTypes(tagged, "VB", true)[0];
    } 

    // Are there at least any adjectives that might work?
    else if (adjectives.length > 0) {
        action = adjectives[0];
    }

    // Lowercase the action if we find one
    action = (action) ? action.toLowerCase() : action;



    // OWNERSHIP
    // Answers : "Who is associated with the target of the
    // action?"
    // -------------------------------------------------- //
    
    // If there is posessive pronouns and we have an action, then
    // the owner is the last posessive word

    if (pronouns.length > 0 && action) {

        // The answer must begin where the action starts
        // ex: "Do you know [What time it is?]
        var answer   = words.slice(words.indexOf(action))
        ,   last_pro = pronouns.slice(-1)[0];

        if (answer.indexOf(last_pro) > 0 || getTypes(answer, "VB").length === 0) {
            owner = last_pro;
        } else {
            owner = getBetween(answer, ["DT", "TO"], ".");
            owner = stripTypes(owner, [".", "VB", "VBZ"]).join(" ");
        }
        
    }

    // No ? Let's try between a preposition and 
    // determiners/nouns
    else if (determiners.length > 0 && preps.length > 0) {

        owner = getBetween(words, ["IN"], ["DT", "NN", "."]);
        
        // Strip punctuation
        owner = stripTypes(owner, ".").join(" ");
    }

    // Hmm, now let's try between the action and the word "to"
    else if (verbs.length > 0 && to.length > 0) {
        owner = getBetween(words, ["VB"], "TO").slice(0, -1).join(" ");
    }

    // At this point, we can really only guess that
    // the owner is between the verb and the end of the
    // statement
    else if (verbs.length > 0) {

        owner = getBetween(words, ["VBZ", "VBP"], ["."]).slice(0, -1);

        // Do we have the word "I" in here?
        if (owner.indexOf("I") === 0) owner = owner.slice(0,1);

        // Strip accidental determinates and punctuation
        owner = stripTypes(owner, ["DT", "."]).join(" ");

    }


    // SUBJECT
    // Answers : "What is this statement about?"
    // -------------------------------------------------- //

    // If there is a file within the statement, it's probably
    // the subject
    if (speech.match(fileEx) !== null) {
        
        // Mainly this is to address
        // "Convert file.x to format
        if (to.length > 0) {
            subject = getBetween(words, "TO", ["NN", "VB"]).join();
        } else {
            subject = speech.match(fileEx)[0].trim();
        }

    }

    // If ownership and there are prepositions, scan for words beween
    // prepositions, determinates, and posessive words and
    // prepositions, nouns, and puncuation
    else if (preps.length > 0) {
        
        subject = getBetween(words, ["DT", "PRP$"], ["IN"]);

        // Strip punctuaction, prepositions, and owners
        subject = stripTypes(subject, [".", "IN"]).join(" ");
    } 
    
    // Is the owner "I" and the verb after the owner is present tense?
    // Helps with "How much memory do I have?"
    else if (owner === "I" && getType(words[words.indexOf(owner) + 1]) === "VBP") {

        var answer = words.slice(0, words.indexOf(owner));

        subject = getBetween(answer, ["JJ"], ["VBP"]).slice(0, -1).join(" ");

    }

    // If there *is* ownership, and there are no prepositions
    // then the subject is inside the owner/determinate/verb and the last noun
    // (*phew...*)

    else if (owner && preps.length === 0) {
        
        subject = getBetween(words, ["TO", "DT", "VBP", "PRP$"], ["NN", "RB"], "inside");

        subject = subject.filter(function(s) {
            s = s.toLowerCase();
            return s !== action && getType(s) !== "VBZ" && s !== owner;
        });
        
        subject = subject.join(" ");

    }


    // Let's check to make sure we properly treat file names
    if (owner && fileEx.test(owner.split(" ").join("")))   owner = owner.split(" ").join("");
    if (subject && fileEx.test(subject.split(" ").join(""))) subject = subject.split(" ").join("");

    
    // Now that everything is properly classified,
    // let's filter the ownership

    switch(owner) {
        
        // Reverse user possession
    case "me": case "my": case "i": case "I":
        owner = "user";
        break;
        
        // Reverse nodebot possession
    case "your": case "you":
        owner = "nodebot";
        break;
        
        // Tweak other non-specific possession cases to the last
        // recorded context
    case "it": case "its": case "they": case "their":
    case "he": case "she": case "his": case "hers":
        owner = Nodebot.memory.context;
        break;
    }
    

    // Return what we find
    // -------------------------------------------------- //

    var ret = {
        action  : action,
        owner   : owner,
        subject : subject,
        tokens  : words
    };

    debug && console.log(ret);

    return ret;
}
