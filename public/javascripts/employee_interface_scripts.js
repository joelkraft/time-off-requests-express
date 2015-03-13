// Set up global config object
(function(exports) {
  var G = {

    // The columns we want to display in the Upcoming Requests portion of the page.
    upcomingRequestsVisibleHeaders: [
      { key:'Type of Leave', title: 'Type of Leave' },
      { key:['Begin Date', 'End Date', 'Time Out', 'Time In'], title: 'Date(s)'},
      { key:'Employee Comments', title: 'Comments' },
      { key:'Status', title: 'Status' }
    ],

    // Translator for labels on the server
    backendHeaderMap: {
      'decision':'Status',
      'employeeName':'Employee',
      'leaveType':'Type of Leave',
      'startDate':'Begin Date',
      'endDate':'End Date',
      'leaveTime':'Time Out',
      'returnTime':'Time In',
      'mealTime':'Meal Time',
      'mealPeriodLength':'Meal Length',
      'timestamp':'Time of Submission',
      'comments':'Employee Comments',
      'employeeEmail':'Employee Email'
    },

    submissionData: {},

    // Add data to the submission data object
    saveSubmissionData: function(data) {
      $.extend(this.submissionData, data);
    },

    // Set a specific property/value on the submission data obj
    setSubmissionDataProp: function(prop, val) {
      this.submissionData[prop] = val;
    },

    // Get submission data object
    getSubmissionData: function() {
      return this.submissionData;
    },

    // Delete all props on the submission data obj except for user data
    resetSubmissionData: function() {
      for (var key in this.submissionData) {
        if (key === 'employeeEmail' || key === 'employeeName') continue;
        delete this.submissionData[key];
      }
    },

    // Setup submission data object with user data
    submissionDataInit: function(userID) {
      this.setSubmissionDataProp('employeeEmail',userID);
      this.setSubmissionDataProp('employeeName',$('h1 span').text().trim());
    },

    // return a submission data object with server-friendly headers to send off
    mapSubmissionDataToBackendHeaders: function() {
      var d, key, result = {}, newKey;
      if((d = this.getSubmissionData()) === undefined) return;
      for(key in d) {
        newKey = this.backendHeaderMap[key];
        if (newKey === undefined) continue;
        result[newKey] = d[key];
      }
      return result;
    }
  };
  exports.GLOBAL = G;
})(window);

// The actual function body was abstracted out so it could be called for a refresh event 
// (when creating a new submission), but it turned out to be difficult to manage the 
// connection/disconnection of event handlers, and a less generic approach was developed
$(init());

// Set handlers. Handlers were delegated as much as possible to avoid complexity in 
// hooking/unhooking event handlers.
function init() {
  $('.leaveType').on('change', createOtherTypeHandler());
  $('#mealTime').datetimepicker({pickDate:false, minuteStepping:15});
  $('#leaveTime').datetimepicker({pickDate:false, minuteStepping:15});
  $('#returnTime').datetimepicker({pickDate:false, minuteStepping:15});
  $('#startDate').datetimepicker({pickTime:false, maxDate: (new Date().getTime() + (1000*60*60*24*365))});
  $('#endDate').datetimepicker({pickTime:false, maxDate: (new Date().getTime() + (1000*60*60*24*365))});
  $('html').on('click', '#resetDates', function() {$('#startDate').val(''); $('#endDate').val('');});
  setCollapseButton('#partial-shift', 'Cancel partial shift');
  $('html').on('click', '#yesMeal', showMealPeriod);
  $('html').on('click', '#noMeal', hideMealPeriod);
  $('html').on('click', '#submit', validateForm);
  $('html').on('click', '#confirmCANCEL', cancelRequest);
  $('html').on('click', '#confirmOK', submitRequest);
  $('html').on('click', '#confirmationHide', hideConfirmation);
  $('html').on('hidden.bs.collapse', '#meal-period-section', resetBlanks);
  $('html').on('show.bs.collapse', '#meal-period-section', function(e){e.stopPropagation();});
  $('html').on('hidden.bs.collapse', '#partial-shift', resetBlanks);
  $('html').on('nameChange', resetPage);
  $('#userChangeModal').on('click', '#userChangeSubmit', changeUser);
  
  // a data-id attribute was seemingly the best way to pass user id data to the client
  var userID = $('html').attr('data-id');

  // of course, the name tag in the h1 will supply the user name, too in this func
  GLOBAL.submissionDataInit(userID);

  // ask the datastore for all user records
  resetUpcomingRequests(userID)

  $('#userChangeModal').modal('show')
}

// Reset upcoming requests
function resetUpcomingRequests(id) {
  $.ajax({
    url:'/collections/users/' + id + '/requests/',
    cache:false,
    success:showCurrentRequests
  })
}

function setDisplayName(name) {
  $('span.displayEmployeeName').html(name)
}

// Reset page in event of name change
function resetPage() {
  clearForm()
  var data = GLOBAL.getSubmissionData(),
      name = data.employeeName,
      email = data.employeeEmail
  setDisplayName(name)
  resetUpcomingRequests(email)
  console.log('resetpage')
}

// Handles changing user's name
function changeUser() {
  var modal$ = $(this).parents('#userChangeModal'),
      name$ = modal$.find('#nameChangeInput'),
      email$ = modal$.find('#emailChangeInput'),
      name = name$.val().trim(),
      email = email$.val().trim(),
      currentUserEmail = GLOBAL.getSubmissionData().employeeEmail

  if (!name || !email || currentUserEmail === email) {
    name$.val('')
    email$.val('')
  } else {
    GLOBAL.setSubmissionDataProp('employeeEmail',email)
    GLOBAL.setSubmissionDataProp('employeeName',name)
    $('html').trigger('nameChange')
  }
  return modal$.modal('hide')
}

// Handles uncollapsing meal period section
function showMealPeriod() {
  var $collapser = $('#meal-period-section'),
      $yesButton = $(this),
      $noButton = $('#noMeal');

  // if form shows alert (red) area for this section, put it back to normal
  stripMealPeriodError($yesButton,$noButton,$noButton.parent().parent());

  // bootstrap's collapse functionality gets buggy if you don't check this before
  // collapsing/uncollapsing
  if ($collapser.css('display') === 'none') {

    $collapser.collapse('show');
    $noButton.removeClass('btn-info').addClass('btn-default');
    $yesButton.removeClass('btn-default').addClass('btn-info');    
  }
}

// Collapses meal period section
function hideMealPeriod(event) {
  var $collapser = $('#meal-period-section'),
      $noButton = $(this),
      $yesButton = $('#yesMeal');

  // if form shows alert (red) area for this section, put it back to normal
  stripMealPeriodError($yesButton,$noButton,$noButton.parent().parent());

  // bootstrap's collapse functionality gets buggy if you don't check this before
  // collapsing/uncollapsing
  if ($collapser.css('display') === 'block') {

    $collapser.collapse('hide');
    $noButton.removeClass('btn-default').addClass('btn-info');
    $yesButton.removeClass('btn-info').addClass('btn-default');    
  } else {
    $noButton.removeClass('btn-default').addClass('btn-info')
    $yesButton.removeClass('btn-info').addClass('btn-default');
  }
}

// Take off error/alert classes - helper function for show/hide mealperiod funcions
function stripMealPeriodError(yBut,nBut,div) {
  yBut.removeClass('btn-danger');
  nBut.removeClass('btn-danger');
  div.removeClass('has-error');
}

// Reset all blanks and remove error classes from a collapsed section
function resetBlanks (e) {
  e.stopPropagation();
  var $collapseDiv = $(this),
      $innerCollapser = $collapseDiv.find('.collapse');
  $collapseDiv.find('div').removeClass('has-error');
  $collapseDiv.find('input').val('');
  $collapseDiv.find('select').val('Please choose:');
  $collapseDiv.find('.btn').removeClass('btn-info active').addClass('btn-default');
  if ($innerCollapser.length > 0 && $innerCollapser.css('display') !== 'none') {
    $innerCollapser.collapse('hide');
  }
}

// The next four functions just manage views for confirmation/cancel sequences.
function cancelRequest() {
  $('#requestConfirmation').fadeToggle(function() {
    $('#mainView').fadeToggle();
  });
}

function hideMainViewAndConfirm() {
  $('#mainView').fadeToggle(revealConfirmation);
}

function revealConfirmation() {
  hideValidationErrorMessage();
  $('#requestConfirmation').fadeToggle();
}

function hideConfirmation() {
  $('#confirmSuccess').fadeToggle(function() {
    $('#mainView').fadeToggle();
  });
}

// Once the server has responded successfully, display conf panel and update
// upcoming requests to show new request.
function showConfirmationSuccess() {
  var $rc = $('#requestConfirmation');
  $rc.fadeToggle(function() {
    $('#confirmSuccess').fadeToggle();
    $rc.children().addClass('bg-warning');
    GLOBAL.resetSubmissionData();
    $.ajax({
      url:'/collections/users/' + GLOBAL.submissionData.employeeEmail + '/requests/',
      cache:false,
      success:showCurrentRequests
    })
  });
}

// Submit data to server.  This also grays out the submit panel.
function submitRequest(e) {
  e.stopImmediatePropagation();
  var $but = $(this);
  if ($but.attr('id') === 'confirmOK') $but.attr('id', 'confirmOK_off');
  submitConfirmationGreyOut();
  var submission = GLOBAL.mapSubmissionDataToBackendHeaders();
  $.ajax({
    url:'/collections/requests/',
    type:'POST',
    data: submission,
    cache:false,
    success:showConfirmation
  })
  // google.script.run
  //   .withFailureHandler(showCurrentRequests)
  //   .withSuccessHandler(showConfirmation)
  //   .withUserObject(this)
  //   .enterFormSubmission(submission);
}

// Helper for submitRequest(). Takes care of the graying out.
function submitConfirmationGreyOut() {
  var $panel = $('#requestConfirmation');
  $panel.find('button').addClass('disabled');
  $panel.find('h2').html('Please wait...');
  $panel.children().removeClass('bg-warning')
}

// resets grayed out areas and shows confirmation success.
function showConfirmation() {
  clearForm();
  var $but = $(this);
  if ($but.attr('id') === 'confirmOK_off') $but.attr('id', 'confirmOK');
  showConfirmationSuccess();
}

// Resets form elements to default positions/values
function clearForm() {
  $('.form-control:not(#mealPeriodLength)').val('');
  $('#mealPeriodLength, .leaveType').val('Please choose:');
  var $meal = $('#meal-period-section'),
      $part = $('#partial-shift'),
      $yesNoMealDiv = $meal.prev();
  
  $yesNoMealDiv.find('input').parent().removeClass('active btn-info').addClass('btn-default');
  if ($meal.css('display') !== 'none') $meal.collapse('hide');
  if ($part.css('display') !== 'none') $part.collapse('hide');
  hideValidationErrorMessage();
}

// Returns handler for the leave type dropdown menu.  creates and manages a 
// blank for user to enter cutsom type of leave.
function createOtherTypeHandler() {
  // Immediate function here provides the following variable in its 
  // closure to cache the last entered text of the other field of the form.
  var blankText = '';
  return function() {
    var select = $(this),
        val = select.val(),
        specify, blank;
    if (val === 'other') {
      if (select.next().length === 0) {
        specify = $('<input type="text" class="form-control" id="specifyType" placeholder="Please specify">').insertAfter(select);
        if (blankText) specify.val(blankText);
      }
    } else {
      if ((specify = select.next()).length !== 0) {
        blankText = specify.val();
        specify.remove();
      }
    }
  };
}
  
// Set up handlers for show/hide functionality of partial shift.  It's done in
// this function to enclose cancel text and original text.
function setCollapseButton(selector, cancelText) {
    var $collapseContent = $(selector),
        origButtonText = $collapseContent.prev().html();
    
    $('html').on('show.bs.collapse', selector, {buttonText: cancelText}, function(e) {
      var $button = $(this).prev();
      $button.html(e.data.buttonText);
      $button.removeClass('btn-default').addClass('btn-warning');
    });
    
    $('html').on('hidden.bs.collapse', selector, {buttonText: origButtonText}, function(e) {
      var $button = $(this).prev();
      $button.html(e.data.buttonText);
      $button.removeClass('btn-warning').addClass('btn-default');
    });
}

// First step toward submission of form data.  Validates form.
function validateForm() {

  // These 2 booleans will be used to know whether to check their containers or not
  var isPartialShiftCollapsed = ($('#partial-shift').css('display')  === 'none' ? true : false),
      isMealPeriodCollapsed = ($('#meal-period-section').css('display')  === 'none' ? true : false),

      // These arrays - required, atLeastOne - represent an attempt to 
      // set up a larger formal system for handling basic requirements 
      // around empty form elements. It turned out to be more complicated 
      // than that, and this issue might benefit from refactoring.
      required = [
        'leaveType',
        'startDate',
        'mealPeriodLength'
      ],

      // perform action depends on whether its section is open or not
      atLeastOne = [
        {
          keys: [
            'leaveTime',
            'returnTime'
          ],
          performAction: !isPartialShiftCollapsed
        },
        {        
          keys: [
            'yesMeal',
            'noMeal'
          ],
          performAction: !isPartialShiftCollapsed,

          // method to handle bootstrap error class adding/subtracting
          setErrors: function(pass, map) {
            var btnY = map.yesMeal.$,
                btnN = map.noMeal.$,
                div = map.noMeal.parent.parent();
            if (pass) {
              if (btnY.hasClass('btn-danger')) {
                btnY.removeClass('btn-danger').addClass('btn-default');            
              }
              if (btnN.hasClass('btn-danger')) {
                btnN.removeClass('btn-danger').addClass('btn-default');
              }
              div.removeClass('has-error');
            } else {
              btnY.removeClass('btn-default').addClass('btn-danger');
              btnN.removeClass('btn-default').addClass('btn-danger');
              div.addClass('has-error');
              valid = false;
            }
          }
        }
      ],
      endDate = $('#endDate').val(),
      mealTime = $('#mealTime').val(),

      // create the responses object we'll use to transmit to server
      responses = {
        endDate: endDate ? new Date(endDate).getTime() : undefined,
        mealTime: mealTime ? moment(mealTime, 'LT').toDate().getTime() : undefined,
        comments: $('#comments').val(),
        isPartialShiftCollapsed: isPartialShiftCollapsed,
        isMealPeriodCollapsed: isMealPeriodCollapsed
      },
      valid = true,
      text = '',
      jQ;

  // the variable arr is a misnomer here, as it is actually an object.
  atLeastOne.forEach(function(arr) {
    if (arr.performAction) {
      var map = {},

          // map() may seem to be unnecessary here, as id passes inertly through
          // it, but it's used instead of a seemingly more appropriate forEach()
          // because it passes the array forward to every(), while forEach()
          // would pass undefined along.  every() is of course responsible for
          // setting nonePass to a boolean value after all is said and done.
          nonePass = arr.keys.map(function(id) {
            jQ = $('#' + id);
            var val = jQ.val();
            map[id] = {
              $: jQ,
              val:val,

              // not generic logic.  only works for the current form elements.
              pass: (jQ.attr('type') === 'text') ? !!val : jQ.hasClass('active'),

              parent: jQ.parent()
            };
            return id;
          })

          // Probably inverting this return statement and renaming nonePass to 
          // pass would make some sense in the larger context.
          .every(function(id) {
            return !map[id].pass
          });

      if (arr.setErrors) {

        // flipping nonePass is a little counterintuitive. See a few lines above.
        arr.setErrors(!nonePass, map);
      } else if (nonePass) {
        arr.keys.forEach(function(id) {
          if (!map[id].parent.hasClass('has-error')) map[id].parent.addClass('has-error');

          // take data out of responses until error is cleared up
          if (id in responses) delete responses[id];
        });
        valid = false;
      } 

      // this else clause is only possible because of the unique structure
      // of this form/code.  perhaps the way to clear this up is to make
      // setErrors more generic.  As it stands, the code in this block is
      // only ever run for 'leaveTime' and 'returnTime', which is precisely
      // what is exploited.
      else {
        arr.keys.forEach(function(id) {
          if (map[id].val) {
            responses[id] = moment(map[id].val, 'LT').toDate().getTime();
          } else { delete responses[id]; }
        });
      }
    }
  });
  
  required.forEach(function(e) {
    var $e = $('#' + e),
        val = $e.val(),
        $div = $e.parent(),
        $otherTime;

    // modify val in the case of a custom leave type.
    val = (e === 'leaveType' && val === 'other') ? $('#specifyType').val() : val;

    // only count leave time if that section is expanded
    if (e === 'leaveTime' || e === 'returnTime') {
      if (responses.isPartialShiftCollapsed) {
        if (responses[e]) delete responses[e];
        return;
      }
    }

    // only count mealPeriodLength if that section is expanded
    if (e === 'mealPeriodLength') {
      if (responses.isMealPeriodCollapsed) {
        if (responses[e]) {
          delete responses[e];

          // no period len means no mealtime either
          if (responses.mealTime) delete responses.mealTime;
        }
        return;
      }
    }
  
    // Refactoring this to supply a method that handles errors might
    // make this code more generic too.  Already, this does handle
    // all cases with 2 expressions, though.
    if (!val || val === 'Please choose:') {
      if (!$div.hasClass('has-error')) $div.addClass('has-error');
      if (responses.hasOwnProperty(e)) delete responses[e];
      valid = false;
    } 

    // remove error class
    else {
      if ($div.hasClass('has-error')) $div.removeClass('has-error');
      if (!responses.hasOwnProperty(e)) {

        // be sure to handle dates/times, and pass them to the server in milliseconds
        if (e.search(/Date/) !== -1) {
          responses[e] = new Date(val).getTime();
        } else if (e.search(/Time/) !== -1) {
          responses[e] = moment(val, 'LT').toDate().getTime();
        } else {
          responses[e] = val;
        }
      }
    }
  });

  // Handle time inconsistent start and end dates to time off
  if (responses.endDate && responses.startDate) {
    if (responses.endDate < responses.startDate) {
      $('#startDate').parent().addClass('has-error');
      $('#endDate').parent().addClass('has-error');
      valid = false;
    } else {
      $('#startDate').parent().removeClass('has-error');
      $('#endDate').parent().removeClass('has-error');
    }
  } else { $('#endDate').parent().removeClass('has-error'); }

  if (valid) {

    // All good!  move on to confirmation
    confirm(responses);

  } else {

    // Some things need fixing before we can submit this
    showValidationErrorMessage();

  }
}

// Convey errors to user, to be fixed before form can be submitted
function showValidationErrorMessage() {
  var $errDiv = $('#formError');
  if (!$errDiv.hasClass('alert alert-danger')) {
    $errDiv.addClass('alert alert-danger');
  }
    $errDiv.html('Some of the information needed was incorrect or not given. Please review the places above in red.');
}

function hideValidationErrorMessage() {
  $('div').removeClass('has-error');
  var $errDiv = $('#formError');
  if ($errDiv.hasClass('alert alert-danger')) {
    $errDiv.removeClass('alert alert-danger');
  }
    $errDiv.html('');
}

// display a confirmation panel, hiding the form.  Last step before
// submitting to server.
function confirm(data) {
  var $confirmPanel = $('#requestConfirmation'),
      partialShift = !data.isPartialShiftCollapsed,
      meal = !data.isMealPeriodCollapsed,
      getReadableDate = function (d) {
        return d ? moment(d).format('dddd, MMM Do') : null;
      },
      getReadableTime = function(t) {
        return t ? moment(t).format('h:mm a') : null;
      },

      // parameter obj seems to have no purpose here.
      displayOrder = (function(obj) {

        // Choose what to display to user based on what user has submitted
        var arr = [
          {
            key: 'leaveType',
            printName: 'Type of leave'
          },
          {
            key: 'startDate',
            printName: data['endDate'] ? 'Start Date' : 'Date',
            value: getReadableDate(data.startDate)
          },
          {
            key: 'endDate',
            printName: 'End Date',
            value: getReadableDate(data.endDate)
          }
        ];
        if(partialShift) {
          if (data.leaveTime) {
            arr[arr.length] = {
              key: 'leaveTime',
              printName: 'Time out',
              value: getReadableTime(data.leaveTime)
            };
          }
          if (data.returnTime) {
            arr[arr.length] = {
              key: 'returnTime',
              printName: 'Time in',
              value: getReadableTime(data.returnTime)
            };
          }
        }
        if(meal) {
          arr[arr.length] = {
            key: 'mealTime',
            printName: 'Preferred meal time',
            value: getReadableTime(data.mealTime)
          };
          arr[arr.length] = {
            key: 'mealPeriodLength',
            printName: 'Preferred meal period length'
          };
        }
        arr[arr.length] = {key: 'comments', printName: 'Comments'};
        return arr;
      })(),

      // begin building html to display
      display = '<div class="row"><div class="col-xs-12"><h2 class="text-muted text-center">Please confirm your request details</h2></div></div>';
  
  // build html based on displayOrder
  displayOrder.forEach(function(obj) {
    if (!obj.value && !data[obj.key]) return;
    display += '<div class="row">';
      display += '<div class="col-xs-6"><b>' + obj.printName + '</b></div><div class="col-xs-6">' + (obj.value || data[obj.key]) + '</div>';
    display += '</div>';
  });
  
  display += '<div class="row"><div class="col-xs-12">' +
               '<button type="button" id="confirmCANCEL" class="btn btn-danger pull-right">Go back</button>' +
               '<button type="button" id="confirmOK" class="btn btn-primary pull-right">OK</button>' +
             '</div></div>'
  
  $confirmPanel.find('.displayDataToConfirm').html(display);
  
  data.timestamp = new Date().getTime();
  data.decision = 'Pending';

  // save the data for submission to server on confirmation
  GLOBAL.saveSubmissionData(data);
  hideMainViewAndConfirm();
}

// Accepts upcoming request data from server and updates view accordingly.
function showCurrentRequests(data) {
  var reformatTimes = function(arr) {
    var stDate = moment(arr[0]).format('dddd, MMM Do'),
        enDate = arr[1] ? moment(arr[1]).format('dddd, MMM Do') : null,
        stTime = arr[2] ? moment(arr[2]).format('h:mma') : null,
        enTime = arr[3] ? moment(arr[3]).format('h:mma') : null,
        str = stDate;
    if (enDate) {
      str += stTime ? ', ' + stTime : '';
      str += ' to <br>' + enDate;
      str += enTime ? ', ' + enTime : '';
    } else {
      str += stTime ? ', <br>' + stTime : '';
      str += enTime ? ' to ' + enTime : '';
    }
    return str;
  },
  headerNames = GLOBAL.upcomingRequestsVisibleHeaders.map(function(header){ return header.title}).concat('','');
  data = data.filter(function(row){
    return ['Approved','Pending','Waitlisted','Status'].indexOf(row['Status']) > -1;
  }),
  name;
  if (data.length === 0) {
    console.log('data has no length: ' + data.length)
    data = '<tr><td>You have no upcoming time off requests.</td></tr>';
  } else {
    name = data[0]['Employee']
    setDisplayName(name)
    GLOBAL.setSubmissionDataProp('employeeName', name)
    data = data.map(function(row) {

      // Set formatting of Status
      var textClass = {Approved:'text',Pending:'text-muted',Waitlisted:'text-muted'}[row['Status']],
          arr;
      if (row['Status'] === 'Pending') { row['Status'] = '<em>' + row['Status'] + '</em>'; }
      else { row['Status'] = '<span class="label label-' + {Approved:'success', Waitlisted:'default'}[row['Status']] + '">' + row['Status'] + '</span>'; }

      // get headers that we want to display, handle the data specially
      // if Date obj by converting to custom strings
      arr = GLOBAL.upcomingRequestsVisibleHeaders.map(function(header) {
        return toS(header.key) === '[object String]' ? row[header.key] : reformatTimes(header.key.map(function(k){return parseInt(row[k])}));
      });

      // add a cancel button
      arr.push('<button type="button" class="btn btn-default">Cancel</button>');

      // this is an additional column to contain confirm button in request
      // cancel sequence
      arr.push('');
      
      return {data:arr, id:row['_id'], textClass:textClass};
    }); 
  }
  var $table = $('.upcomingRequests table');
  var tableGuts = '',
      tag;

  // data will not be an array if there are no requests to display
  if (toS(data) === '[object Array]') {

    // build html table
    data.unshift({data:headerNames});
    for (var i = 0; i < data.length; i++) {
      tableGuts += '<tr data-id="' + data[i].id + '" class="' + data[i].textClass + '">';
        for (var j = 0; j < data[i].data.length; j++) {
          tag = i === 0 ? 'h' : 'd';
          tableGuts += '<t' + tag + '>' + data[i].data[j] + '</t' + tag + '>';
        }
      tableGuts += '</tr>';
    }
  } else {
    $table.html(data);
    return;
  }
  $table.html(tableGuts);
  setCancelButtonHandlers($table);
}

function setCancelButtonHandlers($table) {
  $table.find('button:contains(Cancel)').on('click',setFreshCancelHandler);
}

// This actually handles the first click on a given row to cancel time off.
// A 'cancel the cancellation' button is added (which reads "No, thanks"),
// and the clicked button text changes from "Cancel" to "Confirm" (i.e.
// confirming the cancellation of time off.) A handler nested inside this
// handler is added to the "Confirm" button, which calls the action server-side.
// The final line sets a handler on the "Cancel" button, which results ultimately
// in returning the row to its previous state.
function setFreshCancelHandler() {
  var $cButton = $(this),
      $row = $cButton.parents('tr'),
      $kBtd = $row.children(':last'),
      $kButton = $('<button class="btn btn-primary">No, thanks</button>');
  $cButton.off().removeClass('btn-default').addClass('btn-danger').html('Confirm');
  $row.addClass('danger');
  $kBtd.append($kButton);
  $cButton.on('click',function() {
    var $cButton = $(this),
        $row = $cButton.parents('tr'),
        id = $row.attr('data-id');
    $row.find('button:last').remove();
    $cButton.off().attr('disabled','disabled').addClass('disabled').html('Cancelling...');
    $.ajax({
      url:'/collections/requests/' + id,
      type:'PUT',
      data:{"Status":"Cancelled"},
      cache:false,
      success:completeCancel.bind($row[0])
    })
    // google.script.run
    //   .withSuccessHandler(completeCancel)

    //   // a jQuery object cannot be passed to the successHandler, only a DOM obj
    //   .withUserObject($row[0])

    //   .userCancel(id);
  });
  $kButton.on('click', resetCancelHandler);
}

// During a request cancel sequence, if user aborts, this handler sets
// everything back up again (gets rid of extra button, replaces text in
// cancel button, etc)
function resetCancelHandler() {
  var $kButton = $(this),
      $row = $kButton.parents('tr'),
      $cButton = $row.find('button:first');
  $kButton.off().remove();
  $row.removeClass('danger');
  $cButton
    .removeClass('btn-danger')
    .addClass('btn-default')
    .html('Cancel')
    .off()
    .on('click', setFreshCancelHandler);
}

// Updates view on successfully cancelling time off
function completeCancel(success) {
  var $row = $(this),
      $table = $row.parents('table');
  if (success.msg === 'success') $row.remove();
  // if there are no more pending
  if ($table.find('tr').length === 1) {
    $table.html('<tr><td>You have no upcoming time off requests.</td></tr>');
  }
}

// Orphaned function that was going to be added to execution flow, never was
function processDatesInReturnData(data) {
  return data;
}

// leverages Object's toString function to help handling data types in many functions
// in this file.
function toS(o) {
  return Object.prototype.toString.call(o);
}