/**
 * KordonivkaKino plugin for Movian Media Center
 *
 *  Copyright (C) 2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var http = require('showtime/http');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var BASE_URL = 'http://kordonivkakino.club';

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function trim(s) {
    if (s) return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g, '');
    return '';
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

function appendItem(page, url, shortTitle, fullTitle, icon) {
    var videoparams = "videoparams:" + JSON.stringify({
        title: fullTitle,
        no_fs_scan: true,
        mimetype: 'video/quicktime',
        icon: icon,
        sources: [{
            url: url
        }],
        no_subtitle_scan: true
   });
   page.appendItem(videoparams, 'video', {
       title: shortTitle
   });
}

new page.Route(plugin.id + ":tv:(.*):(.*):(.*)", function(page, url, title, icon) {
    page.loading = true;
    try { // tv
        var doc = http.request(unescape(url)).toString();
        var match = http.request(doc.match(/<iframe src="([\s\S]*?)"/)[1]).toString();
        page.source = "videoparams:" + JSON.stringify({
            title: unescape(title),
            no_fs_scan: true,
            icon: unescape(icon),
            sources: [{
                url: 'hls:https://' + http.request('https://api.livesports24.online/gethost').toString() +
                    match.match(/host \+ "([\s\S]*?)"/)[1]
            }],
            no_subtitle_scan: true
        });
        page.type = 'video';
    } catch(err) {}
    page.loading = false;
});

new page.Route(plugin.id + ":indexItem:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    page.metadata.glwview = Plugin.path + 'list.view';
    page.loading = true;
    var doc = http.request(unescape(url)).toString();
    //1-icon, 2-description 
    var match = doc.match(/<div class="playerInfo[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?\-\->([\s\S]*?)<\/span>/);
    var icon = match[1].match(/http/) ? match[1] : BASE_URL + match[1];
    page.appendItem(icon, 'video', {
        title: unescape(title),
        icon: icon,
        tagline: unescape(title),
        description: new RichText(trim(match[2].replace(/<br><br>/g, ' ').replace(/<br>/g, ' ')))
    });
    match = doc.match(/new Playerjs\(([\s\S]*?)\);/); // html5 player
    if (match) {
        eval('match = ' + match[1]);
        for (var i in match.file)
            appendItem(page, match.file[i].file, match.file[i].title, unescape(title) + ' - ' + match.file[i].title, icon); 
    }
    if (!match) {
        if (match) {
            match = doc.match(/'playlist':([\s\S]*?)}"};/); // flash player
            eval('match = ' + match[1]);
            for (var i in match) 
                appendItem(page, match[i].file, match[i].comment, unescape(title) + ' - ' + match[i].comment, icon);
        }
    }

    var block = doc.match(/class="block">([\s\S]*?)<\/div><\/ul>/);
    if (block) {
        page.appendItem("", "separator", {
            title: 'Похожие'
        });
        appendItems(page, block[1]);
    }
    page.loading = false;
});

function appendItems(page, doc, tv) {
    //1-link, 2-icon, 3-title 
    var re = /<div class="blockItem[\s\S]*?<a href="([\s\S]*?)"[\s\S]*?data-src="([\s\S]*?)"[\s\S]*?<em title="[\s\S]*?">([\s\S]*?)<\/em>/g;
    var match = re.exec(doc);
    while (match) {
        var icon = match[2].match(/http/) ? match[2] : BASE_URL + match[2];
        if (tv)
            page.appendItem(plugin.id + ":tv:" + escape(match[1]) + ":" + escape(match[3]) + ":" + escape(icon), 'video', {
                title: match[3],
                icon: icon,
                tagline: match[3]
            });
         else
            page.appendItem(plugin.id + ":indexItem:" + escape(match[1]) + ":" + escape(match[3]), 'video', {
                title: match[3],
                icon: icon,
                tagline: match[3]
            });
        match = re.exec(doc);
        page.entries++;
    }
}

function parseThePage(page, doc, tv) {
    var block = doc.match(/<div class="block">([\s\S]*?)<\/div><\/div>/);
    if (!block) {
       page.error('К сожалению, поиск по сайту не дал никаких результатов. Попробуйте изменить или сократить Ваш запрос.');
       return false;
    }
    appendItems(page, block[1], tv);
    if (page.entries == 0) { // categories
        //1-icon, 2-link, 3-title
        re = /<img src="([\s\S]*?)"[\s\S]*?<a href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
        var match = re.exec(block[1]);
        while (match) {
            page.appendItem(plugin.id + ":indexFolder:" + escape(match[2]) + ":" + escape(match[3]), 'video', {
                title: match[3],
                icon: match[1].indexOf('http') ? BASE_URL + match[1] : match[1]
            });
            match = re.exec(block[1]);
            page.entries++;
        }
    }
    if (page.entries == 0) {
       page.error('К сожалению, поиск по сайту не дал никаких результатов. Попробуйте изменить или сократить Ваш запрос.');
       return false;
    }

    page.loading = false;
}

function scraper(page, url, tv) {
    page.entries = 0;
    var tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(url).toString();
        parseThePage(page, doc, tv);
        match = doc.match(/class="next"><a href="([\s\S]*?)">/);        
        if (!match) return tryToSearch = false;
        url = match[1];
        return true;
    }
    loader();
    page.paginator = loader;
    page.loading = false;
}

function unicode2win1251(str) {
    if (str == 0) return 0;
    var result = "";
    var uniCode = 0;
    var winCode = 0;
    for (var i = 0; i < str.length; i++) {
        uniCode = str.charCodeAt(i);
        if (uniCode == 1105) 
            winCode = 184;
        else if (uniCode == 1025) 
            winCode = 168;
        else if (uniCode > 1039 && uniCode < 1104)
            winCode = uniCode - 848;
        else 
            winCode = uniCode;
        result += String.fromCharCode(winCode);
    }
    var encoded = '';
    for (var i = 0; i < result.length; ++i) {
        var code = Number(result.charCodeAt(i));
        encoded += "%" + code.toString(16).toUpperCase();
    }
    return encoded;
}

new page.Route(plugin.id + ":indexFolder:(.*):(.*)", function(page, url, title) {
    page.model.contents = 'grid';
    setPageHeader(page, unescape(title));
    scraper(page, BASE_URL + unescape(url), title == 'TV' ? 1 : 0);
});

new page.Route(plugin.id + ":start", function(page) {
    page.model.contents = 'grid';
    setPageHeader(page, plugin.synopsis);
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Поиск в ' + BASE_URL
    });
    page.loading = true;
    doc = http.request(BASE_URL).toString();
    page.loading = false;
    var htmlBlock = doc.match(/class="navHome">([\s\S]*?)<\/nav>/);
    // 1-link, 2-title
    var re = /<a href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
    var match = re.exec(htmlBlock[1]);
    while (match) {
        page.appendItem(plugin.id + ":indexFolder:" + escape(match[1]) + ":" + escape(trim(match[2])), 'directory', {
            title: trim(match[2])
        });
        match = re.exec(htmlBlock[1]);
    }
    page.appendItem(plugin.id + ":indexFolder:/porno-tv:TV", 'directory', {
        title: 'TV'
    });

    page.appendItem("", "separator", {});
    scraper(page, BASE_URL);
});

function search(page, query) {
    page.model.contents = 'grid';
    setPageHeader(page, plugin.title);  
    page.entries = 0;
    var tryToSearch = true, p = 1;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(BASE_URL + '/upload/index.php?do=search&subaction=search&search_start=' + p + '&story=' + unicode2win1251(query)).toString();
        page.loading =  false;
        parseThePage(page, doc);
        if (!doc.match(/href="#">Вперед/)) return tryToSearch = false;
        p++;
        return true;
    }
    for (var i = 0; i < 5; i++) // fixing broken paginator :(
        loader();
    page.paginator = loader;
}

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    search(page, query);
});

page.Searcher(plugin.id, logo, function(page, query) {
    search(page, query);
});
