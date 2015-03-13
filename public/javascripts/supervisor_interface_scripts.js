  $(function() {

    // Instantiate controller
   var controller = new Controller();

    // As opposed to adding multiple listeners, it was decided to use a switch to
    // respond to different events with one listener. Probably could be done more
    // elegantly with jQuery.
    model.addListener(function(model, changeType, parameter) {
      switch (changeType) {
        case 'modelInitialized':
          controller.init(model);                            // may need to add .bind(controller)
          break;
        case 'status':
          // update table body button
/*          controller[parameter.id].row$.find('button')
            .removeClass(function(i,cl){
              var c = cl.match(/btn-[^x]\w+/);
              return c ? c[0] : '';
            })
            .addClass('btn-' + controller.getStatusColorClass(parameter.status))
            .html(controller.getPastTense(parameter.status));*/
          // update status: details panel
          $('#decisionPanelInfoTableRequestStatus').html(controller.getPastTense(parameter.status));
          break;
        default:
          break;
      }
    });
    model.getAllRequestsFromServer();

    // Not fully realized (and not active), the idea here is to be able to
    // click on any cell in the supervisor interface and edit what's in there,
    // similar to a spreadsheet.
    $('#requestsTable').on('click', 'td:not(:first-child)', editCell);
    
    // Set up handlers
    var SI = $('.supervisor-interface');
    SI.on('click', '#decisionSwitches label', $.proxy(controller.switchStatus,controller));
    SI.on('click', '#cancelDecision', $.proxy(controller.cancelDecision,controller));
    SI.on('click', '#requestsBody button', $.proxy(controller.showDecisionPanel,controller));
    SI.on('click', '#submitDecision', $.proxy(controller.initiateSubmit, controller));
    //SI.on('submitClicked', '#decisionPanel', $.proxy(controller.testitout, controller));
    SI.on('submitClicked', '#decisionPanel', $.proxy(controller.toggleSubmitActiveState, controller));
    SI.on('allRowsLoaded', $.proxy($.fn.filters, SI));
  });

// Convenience function to help when debugging.
function logObj(s) {
  console.log(JSON.stringify(s));
}

// Set up Model, instantiate it and set it on the global object
(function (exports) {

  var Model = function() {
    this.data = {};
    this.momentaryStatus = {};
    this.listeners = []; //{init:[], updateStatus:[]};
    this.mainDisplayHeaders = [
      'Status','Employee','Type of Leave','Begin Date','End Date','Employee Comments','Time of Submission'
    ];
  };
  
  // Call to server for all data in the datastore
  Model.prototype.getAllRequestsFromServer = function() { // Does this need to be set as a listener from Controller?
    $.ajax({
      url:'/collections/requests/',
      cache:false,
      success:this.processServerData.bind(this)
    })
    // google.script.run
    //   .withSuccessHandler(this.processServerData.bind(this))
    //   .getAllRequests();      
  };
  
  // receives data from server, turns each row into documents,
  // stores them in the data object (on the Model), fires modelInitialized when done.
  Model.prototype.processServerData = function(data) {
    // save the data array to preserve its order (for output on the display)
    this.rawData = data;
    var obj = {},
        self = this;
       
    // store each record under its ID for querying, and make header names the properties for retrieving values.
    data.forEach(function(item,i) {
      obj[item['_id']] = item;
    });
    $.extend(true, this.data, obj);
    this.notifyListeners('modelInitialized', this.data);
  };
  
  // A method for saving current status (in case of a user cancel event)
  Model.prototype.saveStatus = function(o) {
    for (var p in o) {
      this.momentaryStatus[p] = o[p];
    }
  };
  
  // Retrieve momentary status
  Model.prototype.getStatus = function() {
    return this.momentaryStatus;
  };
  
  // commit the momentary status onto the datastore
  Model.prototype.commitStatus = function(dateString) {
    var s = this.momentaryStatus,

        // Pull the record from the datastore
        d = this.data[s.id];

    // Change the record in the datastore
    d['Status'] = s.status;
    d['Decision Time'] = dateString;
    d['Supervisor Comments'] = s.comments;
  }
  
  // sets the record's status back to its initial value
  Model.prototype.resetStatus = function() {
    var s = this.getStatus();
    this.data[s.id]['Status'] = s.status;
    this.notifyListeners('status', s);
  };
  
  // calls each of the listener callbacks with the given change 
  // value and additional parameter
  Model.prototype.notifyListeners = function(change, parameter) {
    parameter = parameter || this.data;
    var this_ = this;
    this.listeners.forEach(function(listener) {
      listener(this_, change, parameter);
    });
  };
  
  // Adds listener to array.  Currently there is only one listener,
  // so it may be a good idea to dispense with the array/method
  Model.prototype.addListener = function(listener) {
    this.listeners.push(listener);
  };
//    unaddListener: function(event, method) {
//      var index;
//      this.listeners[event].forEach(function(e,i) {
//        e === method && index = i;
//      });
//      this.listeners.splice(i,1);
//    }
  
  // instantiate model and set it on the global object
  exports.model = new Model;

})(window);

    
// Set up Controller, instantiate it and set it on the global object
(function(exports) {

  var Controller = function(model) {

    // Store references to key dom elements (in jQuery wrapper)
    this.supervisorInterface$ = $('.supervisor-interface');
    this.requestsBody = $('#requestsBody');
    this.tableBody$ = this.requestsBody.find('table');
    this.tableHead$ = $('#requestsHeader');

    // column widths in pixels for the view
    this.colWidths = [120,190,156,91,91,300,184];

    // This is the barrier that appears with the decision panel to keep
    // the user from triggering handlers on the rest of the page
    this.screen = $('#screen');

    this.decisionPanel = $('#decisionPanel');
    this.submitLock = false;
    this.decisionPanelComments = {p:this.decisionPanel.find('.commentsBox p'), textarea: this.decisionPanel.find('.commentsBox textarea')};
    this.submitButton = $('#submitDecision');
    this.deptSwitchState = 'all';
  };
  
  Controller.prototype.prettyDate = function(ms,type) {
    ms = parseInt(ms)
    if (type === 'datetime') return moment(ms).format('MM/DD/YYYY')
    else if (type === 'time') return moment(ms).format('MM/DD/YYYY h:mm:ssa')
  }

  // Once we have a complete model, this method initiates the controller
  Controller.prototype.init = function(model) {

    this_ = this
    // Create colgroup html string from the widths in colWidths based on the length of mainDisplayHeaders
    this.colgroup$ = $('<colgroup>' + model.mainDisplayHeaders.map(function(e,i) {
        return '<col style="width:' + this.colWidths[i] + 'px">';
      }, this).join('') + '</colgroup>');

    // Generate table head html from mainDisplayHeaders
    this.thead$ = $('<thead><tr>' + model.mainDisplayHeaders.map(function(e,i) {
      return '<th style="width:' + this.colWidths[i] + 'px">' + e + '</th>';
    },this).join('') + '</tr></thead>');
    this.tbody$ = $('<tbody></tbody>');
    
    this.allRows = [];

    // alias model.headerOrder
    var h = model.headerOrder;

    // Build table body html string from rawData array
    model.rawData.forEach(function(request,i) {
      var id = request['_id'],
          this_ = this,
          tableRow = model.mainDisplayHeaders.reduce(function(prev, cur, i) {
            var contents = request[cur] || '';

            // Truncate employee comment in main view if too long
            if (cur === 'Employee Comments' && contents.length > 36) {
              contents = contents.replace('\n', ' ').substr(0,36).trim() + '...';
            }

            if (cur.indexOf('Date') > -1) contents = this_.prettyDate(contents, 'datetime')
            else if (cur.indexOf('Time') > -1) contents = this_.prettyDate(contents, 'time')
            return prev + '<td>' + (cur === 'Status' ? this_.xsButton(contents) : contents) + '</td>';
          }, ''),
          employeeId = request['Employee Email'],
          // userInfo = model.allUserInfo[employeeId],
          // dept = ((userInfo && userInfo.dept) || ''),
          row$ = $('<tr data-id="' + id + /*'" data-dept="' + dept +*/ '">' + tableRow + '</tr>'),
          tds = [];

      // Store a reference to this row on Controller under the record's ID.
      this[id] = row$;

      // Put $row in an array that will be appended to the page to form the initial view
      this.allRows.push(row$);

      // If there's no department, continue with the action, but email the AS tech the details.
      // if (!dept) google.script.run.clientSendErrorEmail(JSON.stringify({
      //     message:'Supervisor Interface for TOR system could not locate employee data in Script Properties (for loading dept info). This may not have been stored when the employee made the initial request.',
      //     employeeId:employeeId,
      //     timestamp:moment().format('M/D/YYYY hh:mm:ss a'),
      //     requestId:id
      //   }));
    }, this);
    this.tbody$.append(this.allRows);
    this.tableHead$.append(this.thead$);
    this.tableBody$.html('').append(this.colgroup$, this.tbody$);
    $('.supervisor-interface').trigger('allRowsLoaded');

    // The yellow background is used to hilight a row when a change has been committed
    this.requestsBody.css('background-color', 'yellow');
    //placeRequestsOnPage(data);
  };
  
  // Simple switch to change a status's present to past tense for display purposes.
  Controller.prototype.getPastTense = function(status) {
    return {Approve:'Approved',Deny:'Denied',Cancel:'Cancelled',Waitlist:'Waitlisted',Pending:'Pending'}[status] || status;
  };
    
  // Convert app status language into Bootsrap labelling classes
  Controller.prototype.getStatusColorClass = function(status) {
    status = status.slice(0,2).toLowerCase();
    var classMap = {ap:'success',de:'danger',pe:'info',wa:'warning',ca:'default'};
    return classMap[status] || 'default';
  }
  
  // wrapper for applyLabel to wrap it in a small button
  Controller.prototype.xsButton = function(text) {return this.applyLabel(text,'btn-xs')};
  
  // wrapper for applyLabel to wrap it in a button - Unused
  Controller.prototype.normButton = function(text) {return this.applyLabel(text)};
  
  // only used by xsButton or normButton to generate button html
  Controller.prototype.applyLabel = function(text, sizeClass) {
    sizeClass = sizeClass ? ' ' + sizeClass : '';
    var color = ' btn-' + this.getStatusColorClass(text);
    return '<button class="btn' + sizeClass + color + '">' + text + '</button>';
  };
    
  // Selects some dom elements, though this method is unused.
  Controller.prototype.selectFilters = function(event) {
    var body = this.tableBody$,
        bl$ = this.filterInput$,
        m$ = this.filterMenu$,
        but$ = this.filterButton$,
        choice$ = $(event.target),
        choice = choice$.html();
        
    //m$.prepend('<li><a href="#">' + but$.text().trim() + '</a></li>');
    but$.html(but$.html().replace(but$.text(), choice + ' '));
    //choice$.parent().remove();
    // handle putting off and putting on handlers                         ////////*****************/////////////***************////////////
    switch (choice) {
      case 'Holiday':
        break;
      default:
        break;
    }
  };
  
  // Shows the decision panel when a request is selected for review
  Controller.prototype.showDecisionPanel = function showDecisionPanel(e) {
    var id = +$(e.target).parents('tr').attr('data-id'),        
        panel$ = this.decisionPanel,
        detailsPanel$ = panel$.find('#detailsPanel'),
        name$ = panel$.find('.employeeName'),
        status = model.data[id]['Status'],
        buttons$ = panel$.find('#decisionSwitches label'),
        this_ = this;
    
    console.log('\nwindow height: ' + $(window).height() + '\nscreen height: ' + this.screen.height());

    // darken background, also prevent user interaction when decision panel is in focus
    this.screen.show();

    // copy status in case the act to decide is cancelled
    model.saveStatus({status:status, id:id});

    name$.html(model.data[id]['Employee']);
    buttons$.removeClass().addClass('btn btn-default');

    // note this is the jQuery each, where index comes first.
    // this activates the button whose status is active.
    buttons$.each(function(i,button) {
      var e$ = $(button),
          cur = e$.attr('id').slice(0,2).toLowerCase(),
          mod = model.data[id]['Status'].slice(0,2).toLowerCase();
      cur === mod && e$.removeClass('btn-default').addClass(this_.setStatusState(cur) + ' active');
    });
    detailsPanel$.html(this.tabulateDetails(model.data[id]));

    // Once it is all prepared, toggle it to be visible
    panel$.show();
  };
  

  // Activate button whose status has been selected, deactivate the others.
  Controller.prototype.switchStatus = function switchStatus(event) { // #decisionSwitches label

    // If the form has been submitted, don't allow any status change.
    if (this.submitLock === true) return;

    var button$ = $(event.target),
        buttonText = button$.text().trim(),
        allButtons$ = button$.parent().children();
    
    allButtons$.each(function(i,button) {
      var e$ = $(button);
      !e$.hasClass('btn-default') && 
        e$.removeClass(function(ind,c){return c.match(/btn-\w+/)[0];})
          .addClass('btn-default');
    });
    
    button$.removeClass('btn-default').addClass(this.setStatusState(button$.attr('id').slice(0,2).toLowerCase()) + ' active');
    model.notifyListeners('status',{status:buttonText, id: model.momentaryStatus.id });

    // Update the model
    model.saveStatus({status:this.getPastTense(buttonText)});
  };
  
  // Cancel the act to decide on a given request
  Controller.prototype.cancelDecision = function cancelDecision(event) {

    // Don't allow any additional cancel-button presses to do anything
    if (this.submitLock === true) return;

    model.resetStatus();
    this.decisionPanelComments.textarea.val('');
    $(event.target).parents('#decisionPanel').hide();
    this.screen.hide();
  };

  // Puts the decision panel in an inactive state or makes it active
  Controller.prototype.toggleSubmitActiveState = function() {
    var elems = this.decisionPanel.find('input').add(this.decisionPanel.find('label')),
        panel = this.decisionPanel.find('.panel'),
        pComments = this.decisionPanelComments.p,
        taComments = this.decisionPanelComments.textarea,
        commentsVal = taComments.val(),
        submitButton = this.submitButton;
    
    model.saveStatus({comments:commentsVal});
    pComments.html(commentsVal);
    taComments.val('');
    if(this.submitLock) {
      elems.addClass('disabled');
      panel.removeClass('panel-info').addClass('panel-default');
      pComments.show();
      taComments.hide();
      submitButton.attr('value', 'Please wait...');
    } else {
      elems.removeClass('disabled');
      panel.addClass('panel-info').removeClass('panel-default');
      pComments.hide();
      taComments.show();
      submitButton.attr('value', 'Submit');
      this.screen.hide();
      this.decisionPanel.hide();
    }
  }
  
  // Trigger the submitClicked event, put lock on further clicks, send data to server
  Controller.prototype.initiateSubmit = function initiateSubmit(event) {
    if (this.submitLock === true) return;
    this.submitLock = true;
    $('#decisionPanel').trigger('submitClicked');
    
    var st = model.getStatus(),
        decisionData = {
          decision: st.status,
          id: st.id,
          comments: st.comments
        };
    
    // google.script.run
    //   .withSuccessHandler($.proxy(this.submitSuccess, this))
    //   .writeDecisionToSpreadsheetAndNotifyEmployee(decisionData);
  };
  
  // Updates the view if the server returns successfully.
  Controller.prototype.submitSuccess = function(decision) {

    // Use momentjs to format the date and time of the submission
    model.commitStatus(moment(decision.time).format('M/D/YYYY hh:mm a'));

    // remove the submitLock
    this.submitLock = false;

    // make the view active again
    this.toggleSubmitActiveState();

    //update view, show confirmation panel..
    var tds = this[decision.id].find('td'),
        findIndex = function(header) { return model.headerOrder.indexOf(header)};

    // Providing a function to .removeClass() allows us to keep 'btn-xs' class
    $(tds[findIndex('Status')])
      .find('button')
      .removeClass(function(i,cl) {
        var matches = cl.match(/btn-\w+/g);
        if (matches.indexOf('btn-xs') > -1) matches.splice(matches.indexOf('btn-xs'),1);
        return matches.join(' ');
      })
      .addClass(this.setStatusState(decision.decision))
      .html(decision.decision);

    // write the comments and time into the row
    $(tds[findIndex('Supervisor Comments')]).html(decision.comments);
    $(tds[findIndex('Decision Time')]).html(moment(decision.time).format('M/D/YYYY h:mm a'));

    // This animation highlights the row yellow for a moment after the decision was submitted to give the
    // eye a chance to find the right row again.
    this[decision.id].animate({'opacity': 0.75}, 800, function() {$(this).animate({opacity: 1}, 800)}).delay(800);
  };
  
  // Simple switch translating a status to bootstrap label color for a button
  Controller.prototype.setStatusState = function setStatusState(status) {
    status = status.toLowerCase().slice(0,2);
    var color = {ap:'success',de:'danger',ca:'default',pe:'info', wa:'warning'};
     return 'btn-' + color[status]; // : 'btn-default';
  };
        
  // Generate html table from d (list of details), accessed by the data we want to show
  Controller.prototype.tabulateDetails = function tabulateDetails(d) {

    //  first, get the headers of the data we want to include
    var defaults = this.getDefaultShownValues(),
        this_ = this;

    // Now return html string, but only include the overlap between d and defaults
    return '<table class="table"><tbody>' + defaults.reduce(function(p,c) {
      return d[c] ? (p + '<tr>' + this_.formatData(c, d[c]) + '</tr>') : p;
    }, '') + '</tbody></table>';
  };
  
  // helper method for tabulateDetails to provide content for each table row
  Controller.prototype.formatData = function formatData(key, value) {
    var statusID = key === 'Status' ? ' id="decisionPanelInfoTableRequestStatus"' : '';
    return '<td><b>' + key + '</b></td>' +
           '<td' + statusID + '>' + value + '</td>';
  };
  
  // provides a simple list of values we want to show in the decision 
  // panel - at present, nearly everything
  Controller.prototype.getDefaultShownValues = function getDefaultShownValues() {
    return [
          'Type of Leave',
          'Begin Date',
          'End Date',
          'Time Out',
          'Time In',
          'Meal Time',
          'Meal Len.',
          'Time of Submission',
          'Status',
          'Employee Comments',
          'Supervisor Comments',
          'Decision Time',
          'Cancellation Time'
        ];
  };

  // Instantiate controller and hang it onto the global object.
  exports.Controller = Controller;
  
})(window);
 
  // plug-in for jQuery to handle the buttons that filter the view
  // the basic pattern for this came from JavaScript Web Applications,
  // by Alex Maccaw, though it has been heavily modified.
  jQuery.fn.filters = function(control) {
    var element = $(this),
        menu = $('#filter ul'),
        button = $('#filter button'),
        requestsBody = $('#requestsBody'),
        reqBodyTable = requestsBody.find('table'),
        rows = requestsBody.find('tr'),
        headerRow = $('#requestsHeader').find('tr'),
        bottomSpacer = $('#requestsBodySpacer'),
        deptFilter = $('#deptFilterSwitches label'),
        deptFilterState = 'all',
        currentFilter = 'search',
        textEntered = '',
        deptFilteredOut = function(row) {
          var dept = deptFilterState === 'all' ? null : deptFilterState;
          return (dept && row.attr('data-dept') !== dept)
        },
        resetFilterStore = function(filter) {
          textEntered = '';
          currentFilter = filter;
        };  // '.supervisor-interface'
    control = $(control);
    
    // Handle clicks on the dropdown menu (currently 'search' & 'holiday')
    element.on('click', '#filter li a', function() {
      // Retrieve filter name
      var filterName = $(this).attr('data-filter');
      
      // Fire custom event on each filter click
      element.trigger('chg.filters', filterName);
    });     // $.proxy(controller.selectFilters, controller)
    
    // Handle selection of department filters
    element.on('click', '#deptFilterSwitches label', function(e) {
      deptFilterState = {'deptAll':'all','deptStx':'stx','deptCirc':'circ'}[$(e.target).attr('id')] || 'all';
      element.trigger('filter.' + currentFilter, textEntered);
    });
    
    // Each keyup filters the list by contents in the cells
    element.on('keyup', '#filter input', function(e) {
      var input = $(this),
          key = e.which;
          textEntered = input.val(),
          currentFilter = input.attr('class').replace('form-control','').trim();
      if (filter === 'holiday') return;
      element.trigger('filter.' + currentFilter, textEntered);
    });

    // Bind to custom event
    element.on('chg.filters', function(e, filterName) {
      var elements = element.find('#filter li a'),
          selectedElement = elements.filter("[data-filter='" + filterName + "']");
      elements.css('font-weight', 'normal');
      selectedElement.css('font-weight', 'bold');
      button.html(button.html().replace(button.text(), selectedElement.text() + ' '));
    });
    
    element.on('chg.filters', function(e, filterName) {
      var input = $('#filter input');
      // input.length > 1 && input.filter(':gt(0)').remove(); // for multiple inputs when a date range search will be possible
      input.removeClass(function(i, cls) { return cls.replace('form-control','') });
      rows.each(function(i, row) {
        row = $(row);
        if (deptFilteredOut(row)) {
          row.hide();
        } else {
          row.show();
        }
      });

      // Ensure the spacer sits over the yellow backing if the list is too short for the viewport
      element.trigger('filter.adjustSpacer');
      resetFilterStore(filterName);
      switch (filterName) {
        case 'holiday':
          input.css('background-color', 'rgb(238, 238, 238)').addClass('holiday').val('11/18 - 1/5');
          element.trigger('filter.holiday', '11/8 - 1/5');
          break;
        case 'search':
          input.css('background-color', 'rgb(255, 255, 255)').addClass('search').val('');
          break;
        default:
          input.css('background-color', 'rgb(255, 255, 255)').addClass('default').val('');
          break;
      }
    });
   
    // In the future it may be helpful to provide a means to search by email too
    element.on('filter.search', function(e, val) {
      //console.log('search, value: ' + val + ', rows.length: ' + rows.length);
      rows.each(function(i, row) {
        row = $(row);
        if (deptFilteredOut(row)) {
          row.hide();
          return;
        }
        if (row.find('td:gt(0)').filter(':Contains(' + val + ')').length === 0) {
          row.hide();
        } else {
          row.show();
        }
      });
      element.trigger('filter.adjustSpacer');
    });
    
    // This handler adjusts the spacer to cover up the yellow backing of the table, if 
    // the list of filtered results gets too small. (The yellow backing is what gives
    // hilighting to a line after a decision has been committed.)
    element.on('filter.adjustSpacer', function(e, val) {
      var spacer = bottomSpacer.height(),
          viewport = requestsBody.height(),
          table = reqBodyTable.height(),
          finalHeader = $('#requestsHeader th:last-child');
      if (table < viewport) {
        bottomSpacer.css('height', viewport - table);
        $('#requestsBody').css('max-width', 1133);
      } else {
        bottomSpacer.css('height', 0);
        $('#requestsBody').css('max-width', 1150);
      }
    });
    
    // Handles holiday filter.  This may need to be adjusted from year to year,
    // Though some care was taken to select dates that would be relevant across
    // years.  Still, it might be nice to make a way to adjust them, and store
    // the dates in Script properties.
    element.on('filter.holiday', function(e, val) {
      var beginIndex = headerRow.find('th:contains(Begin Date)').index(),
          endIndex = headerRow.find('th:contains(End Date)').index(),
          beginThresholdDate = new Date('11/18/14').getTime(),
          endThresholdDate = new Date('1/5/15').getTime(),
          getRequestDates = function (b,e) { 
            var tds = this.find('td'),
                begin = new Date(tds[b].innerHTML.trim()).getTime(),
                end = new Date(tds[e].innerHTML.trim() || begin).getTime();
            return {begin: begin, end: end};
          };
      
      rows.each(function(i, row) {
        row = $(row);
        if (deptFilteredOut(row)) {
          row.hide();
          return;
        }
        var requestDates = getRequestDates.call(row, beginIndex, endIndex);
        if ((requestDates.begin > beginThresholdDate && requestDates.begin < endThresholdDate) ||
            (requestDates.end > beginThresholdDate && requestDates.end < endThresholdDate)) {
          row.show();
        } else {
          row.hide();
        }
      });
      element.trigger('filter.adjustSpacer');
    });
    
    // Activate first filter
    var firstFilter = element.find('#filter li a:first').attr('data-filter');
    element.trigger('chg.filters', firstFilter);
    element.trigger('filter.adjustSpacer');
    return this;
  }

  // This makes the search case insensitive.  See this link:
  // http://stackoverflow.com/questions/2196641/how-do-i-make-jquery-contains-case-insensitive-including-jquery-1-8
  jQuery.expr[":"].Contains = jQuery.expr.createPseudo(function(arg) {
    return function( elem ) {
        return jQuery(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
    };
  });

  // Stubbed out function to provide a way to edit cells similar to a spreadsheet,
  // by clicking on them and typing the edits.  May be abandoned for lack of user need.
  function editCell() {
//    var cell = $(this),
//        text = cell.html();
//    cell.html('<input type="text" value="' + text + '">');
    
  }

/*
  function placeRequestsOnPage(data) {
  var tableBody$ = $('#requestsBody table'),
      tableHead$ = $('#requestsHeader'),
      colWidths = [120,140,126,91,80,80,80,90,68,182,227,161,205,171,210,191,150],
      applyLabel = function(text) {
        var span = function(label){return '<button class="btn btn-xs btn-' + label + '">' + text + '</button>'},
            html;
        switch(text) {
          case 'Approved':
            return span('success');
            break;
          case 'Denied':
            return span('danger');
            break;
          case 'Pending':
            return span('info');
            break;
          case 'Waitlisted':
            return span('warning');
            break;
          case 'Cancelled':
            return span('default');
            break;
          default:
            return span('default');
            break;
        }
      },
      colgroup,
      thead,
      tbody;
  
  colgroup = '<colgroup>' + model.headerOrder.reduce(function(p,c,i) {
    return p + '<col style="width:' + colWidths[i] + 'px">';
  }, '') + '</colgroup>';
  
  thead = '<thead><tr>' + model.headerOrder.reduce(function(p,c,i) {
    return p + '<th style="width:' + colWidths[i] + 'px">' + c + '</th>';
  },'') + '</tr></thead>';
  
  tbody = '<tbody>' + model.rawData.reduce(function(p,c) {
    return p + '<tr data-id="' + c.pop() + '">' + c.reduce(function(prev, cur, ind) {
      return prev + '<td>' + (ind === 0 && applyLabel(cur) || cur) + '</td>';
    }, '') + '</tr>';
  }, '') + '</tbody>';
  
  //table$.css('width',  + 'px');
  tableHead$.html(thead);
  tableBody$.html(colgroup + tbody);
}
*/

// Convenience function to use Object's toString method to check data type when debugging
function toS(o) {return Object.prototype.toString.call(o);}
