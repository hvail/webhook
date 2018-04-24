FROM node:8
WORKDIR /usr/local/web

ADD app.js                      /usr/local/web/app.js
ADD package.json                /usr/local/web/package.json
ADD bin                         /usr/local/web/bin
ADD my_modules                  /usr/local/web/my_modules
ADD node_modules                /usr/local/web/node_modules
ADD public                      /usr/local/web/public
ADD routes                      /usr/local/web/routes
ADD views                       /usr/local/web/views

CMD ["npm", "start"]
