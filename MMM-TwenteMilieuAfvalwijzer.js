// STOLEN FROM https://github.com/Timendus/afvalkalender/blob/master/classes/twente_milieu.php
class TwenteMilieu {
    static userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36';
    static companyCode = '8d97bb56-5afd-4cbc-a651-b4f7314264b4';
    static apiDomain = 'https://twentemilieuapi.ximmio.com/api';

    constructor(postcode, huisnummer) {
        this.postcode = this.sanitizePostcode(postcode);
        this.huisnummer = this.sanitizeHuisnummer(huisnummer);
    }

    sanitizePostcode(postcode = null) {
        if (!postcode) {
            return this.postcode;
        }

        const sanitized = postcode.replace(/\s+/g, '');
        if (/^[0-9]{4}[A-Z]{2}$/i.test(sanitized)) {
            return sanitized.toUpperCase();
        } else {
            throw new Error('Invalid postcode');
        }
    }

    sanitizeHuisnummer(huisnummer = null) {
        if (!huisnummer) {
            return this.huisnummer;
        }

        const sanitized = huisnummer.replace(/[^0-9]/g, '');
        if (/^[0-9]+$/i.test(sanitized)) {
            return sanitized;
        } else {
            throw new Error('Invalid house number');
        }
    }

    async getEvents(fromDate) {
        const toDate = new Date(fromDate);
        toDate.setMonth(toDate.getMonth() + 1);
        return this.getCalendar(fromDate, toDate);
    }

    async getAddressUniqueId() {
        const response = await fetch(`${TwenteMilieu.apiDomain}/FetchAdress`, {
            method: 'POST',
            headers: {
                'User-Agent': TwenteMilieu.userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://www.twentemilieu.nl/afval/afval-in-mijn-gemeente?registratie=ja'
            },
            body: new URLSearchParams({
                companyCode: TwenteMilieu.companyCode,
                postCode: this.sanitizePostcode(),
                houseNumber: this.sanitizeHuisnummer(),
                houseLetter: ''
            })
        });

        const result = await response.json();
        return result.dataList[0].UniqueId;
    }

    async getCalendar(fromDate, toDate) {
        const renew = localStorage.getItem('RenewTwenteMilieu');
        let result = JSON.parse(localStorage.getItem('TwenteMilieu'));

        if (!renew || (new Date(renew).getDate() !== fromDate.getDate())) {
            const uniqueAddressID = await this.getAddressUniqueId();

            const response = await fetch(`${TwenteMilieu.apiDomain}/GetCalendar`, {
                method: 'POST',
                headers: {
                    'User-Agent': TwenteMilieu.userAgent,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://www.twentemilieu.nl/enschede/afval/afvalkalender'
                },
                body: new URLSearchParams({
                    companyCode: TwenteMilieu.companyCode,
                    uniqueAddressID,
                    startDate: fromDate.toISOString().split('T')[0],
                    endDate: toDate.toISOString().split('T')[0]
                })
            });

            result = await response.json();
            localStorage.setItem('TwenteMilieu', JSON.stringify(result));
            localStorage.setItem('RenewTwenteMilieu', fromDate.toISOString());
        }

        return this.parseEvents(result.dataList);
    }

    parseEvents(dataList) {
        const events = [];

        for (const trashType of dataList) {
            for (const date of trashType.pickupDates) {
                events.push({
                    date: new Date(date),
                    summary: this.getTrashSummary(trashType._pickupTypeText),
                    type: trashType._pickupTypeText
                });
            }
        }

        return events.sort((a, b) => a.date - b.date);
    }

    getTrashSummary(type) {
        switch (type) {
            case 'GREY':
                return 'Restafval';
            case 'GREEN':
                return 'GFT';
            case 'PAPER':
                return 'Papier';
            case 'PACKAGES':
                return 'Verpakkingen';
            case 'TREE':
                return 'Kerstbomen';
            default:
                return `Unknown trash type: '${type}'`;
        }
    }
}

// STOLEN FROM https://github.com/gertperdZA/MMM-Afvalwijzer/blob/main/MMM-Afvalwijzer.js
Module.register('MMM-TwenteMilieuAfvalwijzer', {
    defaults: {
        postalCode: "7605BG",
        houseNumber: 25,
        dateFormat: "dddd D MMMM",
        numberOfWeeks: 2,
        updateInterval: 24 * 60 * 60 * 1000 // Defaults to 24 hours
    },

    getHeader() {
        return this.config.title;
    },

    start() {
        console.log('Starting module');
        this.scheduleUpdate();
    },

    getStyles() {
        return ['MMM-TwenteMilieuAfvalwijzer.css'];
    },

    getTrashCollectionDays() {
        const twenteMilieu = new TwenteMilieu(this.config.postalCode, this.config.houseNumber);
        twenteMilieu.getEvents(new Date());
    },

    scheduleUpdate(delay) {
        const nextLoad = (typeof delay !== "undefined" && delay >= 0) ? delay : this.config.updateInterval;

        setInterval(() => {
            this.getTrashCollectionDays();
        }, nextLoad);
    },

    capitalize(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    },

    getIconByTrashtype(trashType) {
        const colors = {
            'GREY': "#64656a",
            'GREEN': "#418740",
            'PACKAGES': "#e96c29",
            'PAPER': "#2a70b8",
            'TREE': "#008011"
        };

        const color = colors[trashType] || "#64656a";

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute("class", "binday-icon");
        svg.setAttribute("style", `fill: ${color}`);

        const use = document.createElementNS('http://www.w3.org/2000/svg', "use");
        use.setAttributeNS("http://www.w3.org/1999/xlink", "href", this.file("bin_icon.svg#bin"));

        svg.appendChild(use);
        return svg;
    },

    async getDom() {
        const wrapper = document.createElement("div");
        const twenteMilieu = new TwenteMilieu(this.config.postalCode, this.config.houseNumber);
        const data = await twenteMilieu.getEvents(new Date());
        console.log('pizza')
        for (const trashDay of data) {
            const pickupContainer = document.createElement("div");
            pickupContainer.classList.add("binday-container");

            const dateContainer = document.createElement("span");
            dateContainer.classList.add("binday-date");

            const today = moment().startOf("day");
            const pickUpDate = moment(trashDay.date);

            if (pickUpDate.isBefore(today.clone().add(this.config.numberOfWeeks, "weeks"))) {
                if (today.isSame(pickUpDate, 'day')) {
                    dateContainer.innerHTML = "Today";
                } else if (today.add(1, "days").isSame(pickUpDate, 'day')) {
                    dateContainer.innerHTML = "Tomorrow";
                } else if (today.add(7, "days").isAfter(pickUpDate)) {
                    dateContainer.innerHTML = this.capitalize(pickUpDate.format("dddd"));
                } else {
                    dateContainer.innerHTML = this.capitalize(pickUpDate.format(this.config.dateFormat));
                }

                dateContainer.innerHTML += `: ${this.capitalize(trashDay.summary)}`;

                pickupContainer.appendChild(dateContainer);

                const iconContainer = document.createElement("span");
                iconContainer.classList.add("binday-icon-container");
                iconContainer.appendChild(this.getIconByTrashtype(trashDay.type));

                pickupContainer.appendChild(iconContainer);
                wrapper.appendChild(pickupContainer);
            }
        }

        return wrapper;
    }
});
