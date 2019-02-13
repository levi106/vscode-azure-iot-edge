(function () {
  let vscode = null;
  class LogicalDevice {
    constructor(deviceId, platform, deviceName) {
      this.deviceId = deviceId;
      this.deviceName = deviceName;
      this.platform = platform;
    }

    static fromObject(obj, allDevices) {
      if (!obj.deviceId) {
        throw Error(`The device id missing`);
      }
      if (!obj.platform) {
        throw Error(`The platform missing`);
      }
      let name = allDevices.find(d => d.id === obj.deviceId).name;
      return new this(obj.deviceId, obj.platform, name);
    }

    equals(b) {
      return this.deviceId === b.deviceId && this.platform === b.platform;
    }

    toString() {
      return `${this.deviceName} (${this.platform})`;
    }
  }

  function addToArrayWithoutDup(logicalDevice, list) {
    if (!list.find(device => device.equals(logicalDevice))) {
      list.push(logicalDevice);
    }
  }

  Vue.component('v-select', VueSelect.VueSelect);

  new Vue({
    el: '#main',
    data: {
      version: '',
      publishDate: '',
      featuredExample: null,
      examples: [],
      blogs: [],
      boardId: '',
      logicalDevices: [],
      selectedLogicalDevice: null,
    },
    created: function () {
      const query = this.parseQuery(location.href);
      const url = query.url ||
        'https://raw.githubusercontent.com/Azure-Samples/vscode-azure-iot-edge-sample-gallery/master/sample-gallery.json';
      this.boardId = query.board || '';
      window.addEventListener('resize', () => {
        this.adjustFilterWidth();
      });
      this.httpRequest(url, function (data) {
        let examples = [];
        let aside = [];
        let allPlatforms = [];
        let allDevices = [];
        try {
          if (data) {
            data = JSON.parse(data);
            examples = data.samples;
            allPlatforms = data.platforms;
            allDevices = data.devices;
            aside = data.aside || [];
          }
        } catch (error) {
          // ignore
        }

        if (aside.length) {
          this.generateAside(aside);
        } else {
          document.getElementById('main').className = 'no-aside';
        }

        for (let i = 0; i < examples.length; i++) {
          for (let j = 0; j < examples[i].supportDevices.length; j++) {
            let device = examples[i].supportDevices[j];
            if (!device.deviceId || !device.platform) {
              throw Error(`Missing property deviceId or platform for sample ${examples[i].name}`);
            }
            if (!allDevices.find(d => d.id === device.deviceId)) {
              throw Error(`The device id ${device.deviceId} is not in the list ${JSON.stringify(allDevices)}`);
            }
            if (!allPlatforms.includes(device.platform)) {
              throw Error(`The platform ${device.platform} is not in the list ${JSON.stringify(allPlatforms)}`);
            }
            let logicalDevice = LogicalDevice.fromObject(device, allDevices);
            addToArrayWithoutDup(logicalDevice, this.logicalDevices);
            examples[i].supportDevices[j] = logicalDevice;
          }
          if (examples[i].featured && !this.featuredExample) {
            this.featuredExample = examples.splice(i, 1)[0];
            i--;
          }
        }
        this.examples = examples;

        this.$nextTick(function () {
          this.adjustFilterWidth();
        })
      }.bind(this));
    },
    methods: {
      getProjectName: function (example) {
        if (example.project_name) {
          return example.project_name;
        }

        if (example.name) {
          let project_name = example.name.replace(/[^a-z0-9]/ig, '_').toLowerCase();
          return project_name;
        }

        return 'example_' + new Date().getTime();
      },
      openSample: function (sample, url, boardId, event) {
        let platform = null;
        // If user has a device filter, then it will set the platform as the first device filter match the sample
        // else it will set the platform as the first support devices platform in the sample
        if (this.selectedLogicalDevice) {
          let supportedPlatforms = sample.supportDevices.map(device => device.platform);
          if (supportedPlatforms.includes(this.selectedLogicalDevice.value.platform)) {
            platform = this.selectedLogicalDevice.value.platform;
          }
        }

        if (platform === null) {
          platform = sample.supportDevices[0].platform;
        }

        let name = this.getProjectName(sample);
        if (!vscode) vscode = acquireVsCodeApi();
        vscode.postMessage({
          command: 'openSample',
          name,
          url,
          platform,
        });

        // release the focus. Or when press enter in "set sample name", the enter event will be passed to the webview and trigger the focused element again
        document.activeElement.blur();
      },
      openLink: function (url) {
        if (!url) {
          return;
        }
        if (!vscode) vscode = acquireVsCodeApi();
        vscode.postMessage({
          command: 'openLink',
          url,
        });
      },
      adjustFilterWidth: function () {
        // Code that will run only after the
        // entire view has been re-rendered
        let num = Math.floor(this.$refs.elist.$el.offsetWidth / (320 + 20));
        console.log(this)
        this.$refs.filter.$el.style.width = `${num * (320 + 20) - 20}px`;
      },
      generateAside: function (data) {
        const aside = document.getElementById('aside');
        if (data.length) {
          data.forEach(item => {
            let section;
            switch (item.type) {
              case 'links':
                section = this.generateLinks(item);
                break;
              case 'table':
                section = this.generateTable(item);
                break;
              case 'text':
                section = this.generateText(item);
                break;
              case 'image':
                section = this.generateImage(item);
                break;
              case 'badge':
                section = this.generateBadge(item);
                break;
              default:
                break;
            }
            if (section) {
              aside.appendChild(section);
            }
          });
        }
      },
      httpRequest: function (url, callback) {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              if (callback) {
                callback(xhr.responseText);
              }
            } else {
              if (callback) {
                callback(null);
              }
            }
          }
        }
        xhr.open('GET', url, true);
        xhr.send();
      },
      parseQuery: function (url) {
        if (url.indexOf('?') < 0) {
          return {};
        }
        const query = url.split('?')[1].split('&');
        let res = {};
        query.forEach(q => {
          const item = q.split('=');
          res[item[0]] = item[1] ? decodeURIComponent(item[1]) : undefined;
        });

        return res;
      },
      generateSection: function (obj, className) {
        let section = document.createElement('div');
        section.className = 'section';
        if (className) {
          section.className += ' ' + className;
        }

        if (obj.title) {
          let title = document.createElement('h1');
          title.innerText = obj.title;
          section.appendChild(title);
        }
        return section;
      },
      generateLinks: function (obj) {
        let section = this.generateSection(obj, 'quick-links');
        if (obj.items && obj.items.length) {
          let ulEl = document.createElement('ul');
          ulEl.className = 'links';
          obj.items.forEach((link) => {
            let linkEl = document.createElement('li');
            linkEl.innerText = link.text;
            linkEl.addEventListener('click', () => {
              this.openLink(link.url);
            });
            ulEl.appendChild(linkEl);
          });
          section.appendChild(ulEl);
        }
        return section;
      },
      generateTable: function (obj) {
        let section = this.generateSection(obj, 'info');
        if (obj.rows && obj.rows.length) {
          let tableEl = document.createElement('table');
          obj.rows.forEach((row) => {
            if (row.length) {
              let trEl = document.createElement('tr');
              row.forEach((col) => {
                let tdEl = document.createElement('td');
                tdEl.innerText = col.text;
                if (col.url) {
                  tdEl.className = 'link';
                  tdEl.addEventListener('click', () => {
                    this.openLink(col.url);
                  });
                }
                trEl.appendChild(tdEl);
              });
              tableEl.appendChild(trEl);
            }
          });
          section.appendChild(tableEl);
        }
        return section;
      },
      generateText: function (obj) {
        let section = this.generateSection(obj);
        let pEl = document.createElement('p');
        pEl.innerText = obj.text;
        section.appendChild(pEl);
        return section;
      },
      generateImage: function (obj) {
        let section = this.generateSection(obj);
        let imgEl = document.createElement('img');
        imgEl.src = obj.src;
        if (obj.url) {
          imgEl.className = 'link';
          imgEl.addEventListener('click', () => {
            this.openLink(obj.url);
          });
        }
        section.appendChild(imgEl);
        return section;
      },
      generateBadge: function (obj) {
        let section = this.generateSection(obj, 'badge');
        if (obj.items && obj.items.length) {
          obj.items.forEach((item) => {
            let spanEl = document.createElement('span');
            spanEl.className = item.icon;
            spanEl.innerText = item.text;
            if (item.url) {
              spanEl.className += ' link';
              spanEl.addEventListener('click', () => {
                this.openLink(item.url);
              });
            }
            section.appendChild(spanEl);
          });
        }
        return section;
      },
      generateFeed: function (obj) {
        let section = this.generateSection(obj, 'blog');
        this.httpRequest('https://blogs.msdn.microsoft.com/iotdev/feed/', function (data) {
          let parser = new DOMParser();
          let xmlDoc = parser.parseFromString(data, 'text/xml');
          let items = xmlDoc.getElementsByTagName('item');
          let ulEl = document.createElement('ul');
          ulEl.className = 'blog';
          for (let i = 0; i < Math.min(items.length, 3); i++) {
            let title = items[i].getElementsByTagName('title')[0].textContent;
            let link = items[i].getElementsByTagName('link')[0].textContent;
            let date = new Date(items[i].getElementsByTagName('pubDate')[0].textContent).toISOString().slice(0, 10);
            let description = items[i].getElementsByTagName('description')[0].textContent;

            let liEl = document.createElement('li');
            let h2El = document.createElement('h2');
            h2El.innerText = title;
            h2El.addEventListener('click', () => {
              this.openLink(link);
            });
            liEl.appendChild(h2El);

            let divEl = document.createElement('div');
            divEl.className = 'date';
            divEl.innerText = date;
            liEl.appendChild(divEl);

            let pEl = document.createElement('p');
            pEl.innerText = description;
            liEl.appendChild(pEl);

            ulEl.appendChild(liEl);
          }
          section.appendChild(ulEl);
        });
        return section;
      }
    },
    computed: {
      logicalDeviceOptions: {
        get: function () {
          return this.logicalDevices.map(d => ({
            label: d.toString(),
            value: d,
          }));
        }
      },
      selectedExamples: {
        get: function () {
          if (!this.selectedLogicalDevice) return this.examples;
          return this.examples.filter(e => {
            for (let device of e.supportDevices) {
              if (device.equals(this.selectedLogicalDevice.value)) return true;
            }
            return false;
          })
        }
      }
    }
  });
})();